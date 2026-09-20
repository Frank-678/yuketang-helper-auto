import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./test/support/raw-loader.mjs', pathToFileURL('./'));
