import {
    ClassRegistry,
    HashedObject,
    Identity,
    Lock,
    MeshNode,
    MutableContentEvents,
    MutableSet,
    MutationEvent,
    MutationObserver,
    Resources,
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

    _processEventLock: Lock;
    _pendingEvents: Array<MutationEvent>;

    constructor(owner?: Identity) {
        super();

        // this.pages = new MutableSet<Page>();

        if (owner !== undefined) {
            this.setAuthor(owner);

            this.setRandomId();
            this.addDerivedField('pages', new MutableSet<Page>())
            this._index = new Page("/", this);

            if (this.hasResources()) {
                this._index.setResources(this.getResources() as Resources);
            }

            this.pages?.add(this._index);

            this.init();
        }

        this._processEventLock = new Lock();
        this._pendingEvents    = [];

        this._pagesObserver = (ev: MutationEvent) => {

            this._pendingEvents.push(ev);
            this.processPendingEvents();

            /*
            console.log('observer!')
            console.log(ev.path);
            
            console.log('emitter: ' + ev.emitter.getClassName())
            console.log('data:    ' + ev.data.getClassName())
            console.log('action:  ' + ev.action);
            */
            
            

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

        if (this._node === undefined) {

            console.log('starting sync of wiki ' + this.getLastHash());

            await this.loadAndWatchForChanges();

            this._node = new MeshNode(resources);

            for (let page of (this.pages?.values() || [])) {
                console.log('starting sync page ' + page?.getLastHash())
                await this._node?.sync(page);
                page.addMutationObserver(this._pagesObserver);
                await page.loadAndWatchForChanges();
                for (let block of page.blocks?.contents()!) {
                    console.log('starting sync block ' + block?.getLastHash())
                    await this._node?.sync(block);
                    block.cascadeMutableContentEvents();
                    await block.loadAndWatchForChanges();
                }
            }

            await this._node.broadcast(this);
            await this._node.sync(this);

            console.log('done starting sync of wiki ' + this.getLastHash());
        }
    }

    async stopSync(): Promise<void> {

        if (this._node !== undefined) {

            console.log('stopping sync of wiki ' + this.getLastHash());

            for (let page of (this.pages?.values() || [])) {
                console.log('stopping sync page ' + page?.getLastHash())
                await this._node?.stopSync(page);
                await page.dontWatchForChanges();
                for (let block of page.blocks?.contents()!) {
                    console.log('stopping sync block ' + block?.getLastHash())
                    await this._node?.stopSync(block);
                    await block.dontWatchForChanges();
                }
            }

            await this._node?.stopBroadcast(this);
            await this._node?.stopSync(this);
            this._node = undefined;

        }

        console.log('done stopping sync of wiki ' + this.getLastHash());
    }

    getIndex() {
        return this._index as Page;
    }

    getPages() {
        return this.pages as MutableSet<Page>;
    }
    
    async navigateTo(pageName: string) {

        // create the page we want to navigate to, so we can figure out its hash
        let page = new Page(pageName, this);

        // and try to get it from the wiki
        const existingPage = this.pages?.get(page.hash());

        if (existingPage !== undefined) {
            page = existingPage;
        } else {

            // if the page is not there, add it to the wiki

            if (this.hasResources()) {
                page.setResources(this.getResources()!);
            }

            await this.pages?.add(page);
            await page.save();

            // it's important that we return the same page instance
            // as we're adding, since that one will be kept up to
            // date by the sync (will loadAndWatchForChanges automatically)

        }

        return page;
    }

    private async processPendingEvents() {
        if (this._processEventLock.acquire()) {
            try {

                while (this._pendingEvents.length > 0) {
                    const next = this._pendingEvents.shift() as MutationEvent;
                    await this.processMutationEvent(next);
                }

            } finally {
                this._processEventLock.release();
            }
        }
    }

    private async processMutationEvent(ev: MutationEvent) {

        if (ev.emitter === this.pages) {
            if (ev.action === MutableContentEvents.AddObject) {
                if (this._node) {
                    const page = ev.data as Page;
                    if (this._node) console.log('starting to sync page (obs) ' + page?.getLastHash());
                    await this._node.sync(page);
                    page.addMutationObserver(this._pagesObserver);
                    await page.loadAndWatchForChanges();
                    
                    for (let block of page.blocks?.contents()!) {
                        if (this._node) console.log('starting sync block (obs-init) ' + block?.getLastHash());
                        await this._node?.sync(block);
                        await block.loadAndWatchForChanges();
                    }
                }
            } else if (ev.action === MutableContentEvents.RemoveObject) {
                if (this._node) {
                    const page = ev.data as Page;
                    if (this._node) console.log('stopping page syncing (obs) ' + page?.getLastHash())
                    this._node.stopSync(page);
                    page.dontWatchForChanges();
                    page.removeMutationObserver(this._pagesObserver);
                    for (let block of page.blocks?.contents()!) {
                        if (this._node) console.log('stopping sync block (obs-init) ' + block?.getLastHash())
                        await this._node?.stopSync(block);
                        block.dontWatchForChanges();
                    }

                }
            }
        }
        if (ev.data instanceof Block) {
            const block = ev.data as Block;
            if (ev.action === MutableContentEvents.AddObject) {
                if (this._node) {
                    if (this._node) console.log('starting to sync block (obs) ' + block?.getLastHash())
                    await this._node.sync(block);
                    await block.loadAndWatchForChanges();
                }
            } else if (ev.action === MutableContentEvents.RemoveObject) {
                if (this._node) {
                    if (this._node) console.log('stopping block syncing (obs) ' + block?.getLastHash())
                    await this._node.stopSync(block);
                    block.dontWatchForChanges();
                }
            }
        }
    }
}

ClassRegistry.register(WikiSpace.className, WikiSpace);

export { WikiSpace };
