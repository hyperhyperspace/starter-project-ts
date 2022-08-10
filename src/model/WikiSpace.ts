import {
    ClassRegistry,
    HashedObject,
    Identity,
    MeshNode,
    MutableContentEvents,
    MutableSet,
    MutationEvent,
    MutationObserver,
    // Resources,
    SpaceEntryPoint,
} from "@hyper-hyper-space/core";
import { Block } from "./Block";
import { Page } from "./Page";

class WikiSpace extends HashedObject implements SpaceEntryPoint {
    static className = "hhs-wiki/v0/WikiSpace";

    pages?: MutableSet<Page>;
    
    _index?: Page;
    _pagesObserver: MutationObserver;
    _node?: MeshNode;

    constructor(owner?: Identity) {
        super();

        // this.pages = new MutableSet<Page>();

        if (owner !== undefined) {
            this.setAuthor(owner);

            this.setRandomId();
            this.addDerivedField('pages', new MutableSet<Page>())
            this._index = new Page("/", this);
            this.pages?.add(this._index);

            this.init();
        }

        this._pagesObserver = (ev: MutationEvent) => {

            /*
            console.log('observer!')
            console.log(ev.path);
            
            console.log('emitter: ' + ev.emitter.getClassName())
            console.log('data:    ' + ev.data.getClassName())
            console.log('action:  ' + ev.action);
            */
            
            if (ev.emitter === this.pages) {
                if (ev.action === MutableContentEvents.AddObject) {
                    if (this._node) {
                        console.log('starting to sync page (obs)')
                        const page = ev.data as Page;
                        this._node.sync(page);
                        page.addMutationObserver(this._pagesObserver);
                        page.loadAndWatchForChanges();
                        
                        for (let block of page.blocks?.contents()!) {
                            console.log('starting sync block (obs-init)')
                            this._node?.sync(block);
                            block.loadAndWatchForChanges();
                        }
                    }
                } else if (ev.action === MutableContentEvents.RemoveObject) {
                    if (this._node) {
                        console.log('stopping page syncing (obs)')
                        const page = ev.data as Page;
                        this._node.stopSync(page);
                        page.dontWatchForChanges();
                        page.removeMutationObserver(this._pagesObserver);
                        for (let block of page.blocks?.contents()!) {
                            console.log('stopping sync block (obs-init)')
                            this._node?.stopSync(block);
                            block.dontWatchForChanges();
                        }

                    }
                }
            }
            if (ev.data instanceof Block) {
                const block = ev.data as Block;
                if (ev.action === MutableContentEvents.AddObject) {
                    if (this._node) {
                        console.log('starting to sync block (obs)')
                        this._node.sync(block);
                        block.loadAndWatchForChanges();
                    }
                } else if (ev.action === MutableContentEvents.RemoveObject) {
                    if (this._node) {
                        console.log('stopping block syncing (obs)')
                        this._node.stopSync(block);
                        block.dontWatchForChanges();
                    }
                }
            }

            /*console.log('leaving observer!')*/
        };
    }

    getClassName(): string {
        return WikiSpace.className;
    }

    init(): void {
        // After your object is sent over the network and reconstructed on another peer, or
        // after loading it from the store, this method will be called to perform any necessary
        // initialization.
        this.pages?.cascadeMutableContentEvents();
        this.addMutationObserver(this._pagesObserver);
        if (this._index === undefined) {
            this._index = new Page("/", this);
        }
        
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        // When your object is received from the network, this method will be
        // called to verify its contents before accepting it into the local store.

        return true;
    }

    async startSync(): Promise<void> {
        let resources = this.getResources();

        if (resources === undefined) {
            throw new Error("Cannot start sync: resources not configured.");
        }

        if (resources.config?.id === undefined) {
            throw new Error(
                "Cannot start sync: local identity has not been defined."
            );
        }

        if (resources.store === undefined) {
            throw new Error(
                "Cannot start sync: a local store has not been configured."
            );
        }

        this._node = new MeshNode(resources);

        this._node.broadcast(this);
        this._node.sync(this);

        await this.loadAndWatchForChanges();

        for (let page of (this.pages?.values() || [])) {
            console.log('starting sync page')
            this._node?.sync(page);
            page.addMutationObserver(this._pagesObserver);
            await page.loadAndWatchForChanges();
            for (let block of page.blocks?.contents()!) {
                console.log('starting sync block')
                this._node?.sync(block);
                block.cascadeMutableContentEvents();
                await block.loadAndWatchForChanges();
            }
        }
    }

    async stopSync(): Promise<void> {
        for (let page of (this.pages?.values() || [])) {
            console.log('stopping sync page')
            this._node?.stopSync(page);
            await page.dontWatchForChanges();
            for (let block of page.blocks?.contents()!) {
                console.log('stopping sync block')
                this._node?.stopSync(block);
                await block.dontWatchForChanges();
            }
        }

        this._node?.stopBroadcast(this);
        this._node?.stopSync(this);
        this._node = undefined;
    }

    getIndex() {
        return this._index as Page;
    }

    getPages() {
        return this.pages as MutableSet<Page>;
    }
}

ClassRegistry.register(WikiSpace.className, WikiSpace);

export { WikiSpace };
