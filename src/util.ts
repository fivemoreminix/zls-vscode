import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import path = require('path');

var JSZip = require('jszip');

export function isZigPresent(): boolean {
  const res = spawnSync('zig', ['version'], { encoding: 'utf8' });
  return res.status === 0;
}

export function isProgramPresent(name: string): boolean {
  const res = spawnSync(name, ['--version'], { encoding: 'utf8' });
  return res.status === 0;
}

// Assumes Zig is presently available in the path.
export function getZigVersion(): string {
  const res = spawnSync('zig', ['version'], { encoding: 'utf8' });
  return res.output[0]; // Zig only prints the version by itself (thankfully)
}

// export function execAndThrowOnNonZero(
//   program: string,
//   args?: readonly string[],
//   errorMsg?: string,
// ): SpawnSyncReturns<string> {
//   const result = spawnSync(program, args);
//   if (result.status !== 0) {
//     throw new Error(errorMsg ? errorMsg : `'${program + args?.join(" ")}' failed with status zero.`);
//   }
//   return result;
// }

export async function extractZipArchive(
  archive: string,
  destRoot: string,
): Promise<void> {
  fs.readFile(archive, function(err, data) {
    if (err) {
      throw err;
    }
    var zip = new JSZip();
    zip.loadAsync(data).then(function (zip: any) {
      Object.keys(zip.files).forEach(function (filename: string) {
        zip.files[filename].async('string').then(function (fileContents: string) {
          const entry = zip.files[filename];
          const dest = path.join(destRoot, filename);

          if (entry.dir) {
            fs.mkdirSync(dest);
          } else {
            fs.writeFileSync(dest, fileContents);
          }
        }).catch(function (err: Error) {
          console.error(err);
        });
      });
    });
  });
}

export async function getZigTargets(): Promise<Targets> {
  const res = spawnSync('zig', ['targets'], { encoding: 'utf8' });
  // TODO: handle non-zero exit code of Zig
  const json_output: string = res.output.join("\n"); // Zig only prints the version by itself (thankfully)
  return JSON.parse(json_output);
}

export interface Targets {
  // ... fields omitted.
  native: {
    triple: string;
    cpu: {
      arch: string;
    };
    os: string;
    abi: string;
  };
}
