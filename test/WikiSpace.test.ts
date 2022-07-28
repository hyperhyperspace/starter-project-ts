// @ts-nocheck
import { Store } from '@hyper-hyper-space/core/dist/storage/store';
import { MemoryBackend } from '@hyper-hyper-space/core/dist/storage/backends/MemoryBackend';
import { Identity, RSAKeyPair } from '@hyper-hyper-space/core/dist/data/identity';
import { RNGImpl } from '@hyper-hyper-space/core/dist/crypto/random';
import { HashedObject, Resources, Space, WordCode } from '@hyper-hyper-space/core';
import { describeProxy } from '@hyper-hyper-space/core/test/config';

import {WikiSpace} from '../src/model/WikiSpace'
import { Block } from '../src/model/Block';


let makePeer = async () => {
    let store = new Store(new MemoryBackend(`wiki-test-${String(Math.random())}`));

    let key = await RSAKeyPair.generate(1024);
    let id = Identity.fromKeyPair({ name: new RNGImpl().randomHexString(128) }, key);

    await store.save(key);
    await store.save(id);

    let resources = await Resources.create({ config: { id: id }, store: store });
    return [resources, id]
}


describeProxy('WikiSpace', () => {
    let resourcesA: Resources, resourcesB: Resources;
    let idA: Identity, idB: Identity;
    
    let wikiSpaceA: WikiSpace

    beforeAll(async () => {
        [resourcesA, idA] = await makePeer();
        [resourcesB, idB] = await makePeer();
        HashedObject.registerClass('hhs-wiki/v0/WikiSpace', WikiSpace);
    })

    test('new WikiSpace (peer A)', async () => {
        wikiSpaceA = new WikiSpace(idA) 
        wikiSpaceA.setResources(resourcesA)
        await resourcesA.store.save(wikiSpaceA)
        expect(wikiSpaceA).toBeDefined()
    })

    test('WikiSpace.startSync (peer A)', () => {
        wikiSpaceA.startSync()
    })
    
    test('peer A modifies WikiSpace._index', async () => {
        const testBlock = new Block()
        await testBlock.contents.setValue('lol')
        await resourcesA.store.save(testBlock)
        expect(testBlock.contents.getValue()).toBe('lol')

        await wikiSpaceA._index?.blocks?.insertAt(testBlock, 0)
        await resourcesA.store.save(wikiSpaceA._index)
        expect(wikiSpaceA._index?.blocks?.valueAt(0).contents.getValue()).toBe('lol')

        // await resourcesA.store.save(wikiSpaceA)
    })

    jest.setTimeout(20000)
    test('WikiSpace sync (peer B)', async () => {
        let spaceA = Space.fromEntryPoint(wikiSpaceA, resourcesA);
        await spaceA.entryPoint
        const wikiSpaceCode = await spaceA.getWordCoding();
        console.log(wikiSpaceCode)

        let spaceB = Space.fromWordCode(wikiSpaceCode, resourcesB);
        let wikiSpaceB = await spaceB.entryPoint;
        wikiSpaceB.setResources(resourcesB);
        resourcesB.store.save(wikiSpaceB);
        
        wikiSpaceB.startSync();
        await new Promise((r) => setTimeout(r, 8000));

        // console.log('wikiSpaceB', wikiSpaceB)        
        expect(wikiSpaceB._index.blocks).toBeDefined()
        expect(wikiSpaceB._index.blocks.valueAt(0)).toBe('lol')

    })
})