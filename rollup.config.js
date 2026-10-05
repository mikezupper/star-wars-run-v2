import { nodeResolve } from '@rollup/plugin-node-resolve';
import  json  from '@rollup/plugin-json';
import commonjs from 'rollup-plugin-commonjs';

export default {
    input: 'src/index.js',
    output: {
      file: 'public/scripts/index.js'
    },
   // plugins: [nodeResolve(),commonjs(),json()]
  }