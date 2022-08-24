import { Resources, Store, MemoryBackend, Mesh, Space, WordCode } from '@hyper-hyper-space/core';
import '@hyper-hyper-space/node-env';

import { } from './model/WikiSpace';
export { } from './model/Block';
export { } from './model/Page';

async function main() {

    if (process.argv.length !== 5) {
        console.log('usage: yarn host word1 word2 word3');
    } else {
        const words = [process.argv[2], process.argv[3], process.argv[4]];
        const badWords = [];

        for (const word of words) {
            if (!WordCode.english.check(word)) {
                badWords.push(word);
            }
        }

        if (badWords.length > 0) {
            console.log('the following words are incorrect, please check them and retry: ' + badWords.join(' '));
        } else {
            const resources = await Resources.create({
                store: new Store(new MemoryBackend(words.join('-'))),
                mesh: new Mesh()
            });
            console.log('looking up space ' + words.join('-'));
            const space = Space.fromWordCode(words, resources);
            try {
                const entryPoint = await space.entryPoint;
                console.log('found an space of type ' + entryPoint.getClassName());
                console.log('starting broadcasting & sync...');
                (await space.entryPoint).startSync();
                console.log('done');
            } catch (e: any) {
                console.log('failed to start sync:', e);
            }
            
        }
    }
}

main();