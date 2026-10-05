import esbuild from 'esbuild';
import resolve from 'esbuild-plugin-resolve';

esbuild.build({
  entryPoints: ['./src/index.js'],
  bundle: true,
  keepNames: true,
  format:'esm',
  outfile: './scripts/index-gen.js',
  platform:'neutral',

});
