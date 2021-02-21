import { workspace, ExtensionContext, window } from 'vscode';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions
} from 'vscode-languageclient/node';
import { extractZipArchive, getZigTargets, getZigVersion, isProgramPresent, isZigPresent } from './util';
import { download, fetchReleaseByLatest } from './net';
import { pathToFileURL } from 'url';
import path = require('path');
import { ProcessEnvOptions, exec, spawnSync } from 'child_process';

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
  var zlsPath = workspace.getConfiguration('zigLanguageClient').get('path', '');
  const debugLog = workspace.getConfiguration('zigLanguageClient').get('debugLog', false);
  
  if (!zlsPath) {
    // window.showErrorMessage("Failed to find zls executable! Please specify its path in your settings with `zigLanguageClient.path`.");
    const clicked = await window.showInformationMessage("Download and compile the Zig Language Server?", "Yes");
    if (clicked) { // If the user wants to automatically download and compile ZLS
      // Checks if the Zig compiler is available in PATH
      if (!isZigPresent()) {
        window.showErrorMessage("Zig could not be found in path. Unable to compile from source.");
        return;
      }
      // And we need git too for `--recurse-submodules`
      if (!isProgramPresent("git")) {
        window.showErrorMessage("Git could not be found in path. Unable to download the source.");
        return;
      }

      const zig_version = getZigVersion();
      if (!zig_version.startsWith("0.8.0")) { // Cannot compile from source without latest Zig
        window.showWarningMessage("Cannot compile from source without the latest version of Zig; downloading precompiled binary, instead.");
        try {
          zlsPath = await downloadPrebuilt();
        } catch (error) {
          const clicked = await window.showErrorMessage("Failed to download a precompiled binary of ZLS. So sorry! Please read the instructions on installing manually.", "Instructions", "Report a Bug");
          if (clicked) {
            if (clicked === "Instructions") {
              openInstructions();
            } else {
              vscode.env.openExternal(vscode.Uri.parse("https://github.com/zigtools/zls-vscode/issues"));
            }
          }
          return;
        }
      } else { // Download and compile ZLS from source
        try {
          zlsPath = await downloadAndCompile();
        } catch (error) {
          console.log(error);
          // TODO: on build error, download and install a prebuilt release, instead.
          window.showErrorMessage("ZLS failed to compile."); // TODO: wish we could present build errors to the user
          return;
        }
      }
      
      workspace.getConfiguration('zigLanguageClient').update('path', zlsPath); // Set the new executable path
    } else {
      const clicked = await window.showErrorMessage("You will have to install and configure ZLS manually.", "Instructions");
      if (clicked) {
        openInstructions();
      }
      return;
    }
  }

  let serverOptions: ServerOptions = {
    command: zlsPath,
    args: debugLog ? [ "--debug-log" ] : []
  };

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'zig' }],
    outputChannel: window.createOutputChannel("Zig Language Server")
  };  

  // Create the language client and start the client.
  client = new LanguageClient(
    'zigLanguageClient',
    'Zig Language Server Client',
    serverOptions,
    clientOptions
  );

  client.start();

  vscode.commands.registerCommand("zls.start", () => {
    client.start();
  });

  vscode.commands.registerCommand("zls.stop", async () => {
    await client.stop();
  });

  vscode.commands.registerCommand("zls.restart", async () => {
    await client.stop();
    client.start();
  });
}

export function deactivate(): Thenable<void> {
  return client.stop();
}

async function openInstructions(): Promise<void> {
  vscode.env.openExternal(vscode.Uri.parse("https://github.com/zigtools/zls/wiki/Installing-for-Visual-Studio-Code"));
}

/**
 * downloadAndCompile fetches the latest stable release of ZLS from Git,
 * compiles it, deletes unnecessary files (e.g. source code), and
 * returns the path to the new ZLS binary.
 * 
 * Assumes `zig` and `git` are available from shell.
 */
async function downloadAndCompile(): Promise<string> {
  // TODO: on build error, this function will delete the source code and any files it created. That way it is non-destructive.

  // Download latest release source code to extension folder
  const cwd = __dirname;

  // TODO: show spinner / loading dialog until finished with all tasks

  var output = window.createOutputChannel("Compile ZLS");
  output.show();

  var options: ProcessEnvOptions = new Object();
  options.cwd = cwd; // TODO: allow selecting which version of Zig to install
  exec("git clone --recurse-submodules https://github.com/zigtools/zls.git", options, function (error, stdout, stderr) {
    if (error) {
      throw new Error("Failed to clone ZLS from source.");
    }
    output.append(stdout);
    output.append(stderr);
  });
  options.cwd = path.join(cwd, "zls");
  exec("zig build -Drelease-safe", options, function (error, stdout, stderr) {
    if (error) {
      throw new Error("Failed to compile ZLS.");
    }
    output.append(stdout);
    output.append(stderr);
  });
  

  throw new Error("test");
}

async function downloadPrebuilt(): Promise<string> {
  const cwd = __dirname;

  // Get the host target triple
  const targets = await getZigTargets();
  const host_arch_os: string = [targets.native.cpu.arch, targets.native.os].join("-");

  const release = await fetchReleaseByLatest("zigtools", "zls");
  const repo_path = path.join(cwd, "zls");
  // await download(release.zipball_url, repo_path, `Downloading '${release.name}' Source Code ...`);
  await extractZipArchive(repo_path, cwd);
  // TODO: Delete archive after extracting

  throw new Error("test");
}
