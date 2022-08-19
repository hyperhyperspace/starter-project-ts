import {
    ClassRegistry,
    HashedObject,
    HashedSet,
    Identity,
    LinkupAddress,
    Lock,
    MeshNode,
    MutableArray,
    MutableContentEvents,
    MutableReference,
    MutableSet,
    MutationEvent,
    MutationObserver,
    ObjectDiscoveryPeerSource,
    PeerGroupInfo,
    // Resources,
    SpaceEntryPoint,
    SyncMode,
} from "@hyper-hyper-space/core";
import { Block } from "./Block";
import { Page } from "./Page";

class WikiSpace extends HashedObject implements SpaceEntryPoint {
    static className = "hhs-wiki/v0/WikiSpace";

    moderators?: HashedSet<Identity>;

    title?: MutableReference<string>;
    pages?: MutableSet<Page>;

    offendingPages?: MutableSet<Page>;
    offendingAuthors?: MutableSet<Identity>;

    //_index?: Page;
    _pagesObserver: MutationObserver;
    _node?: MeshNode;

    _processEventLock: Lock;
    _pendingEvents: Array<MutationEvent>;

    _peerGroup?: PeerGroupInfo;

    constructor(owner?: Identity, title?: string, moderators?: IterableIterator<Identity>) {
        super();

        // this.pages = new MutableSet<Page>();

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

        if (owner !== undefined) {

            this.setAuthor(owner);

            this.moderators = new HashedSet<Identity>(moderators);
            this.moderators.add(owner);

            this.setRandomId();
            this.addDerivedField('title', new MutableReference<string>({writers: this.moderators.values()}));
            this.addDerivedField('pages', new MutableSet<Page>());
            this.addDerivedField('offendingPages', new MutableSet<Page>({writers: this.moderators.values()}));
            this.addDerivedField('offendingAuthors', new MutableSet<Identity>({writers: this.moderators.values()}));

            if (title !== undefined) {
                this.title?.setValue(title);
            }

            this.pages?.add(this.createPage('Welcome'));

            /*this._index = new Page("/", this);

            if (this.hasResources()) {
                this._index.setResources(this.getResources() as Resources);
            }

            this.pages?.add(this._index);*/

            this.init();

            
        }
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
        /*if (this._index === undefined) {
            this._index = new Page("/", this);
        }*/
        
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

            const localPeer  = resources.getPeersForDiscovery()[0];
            const peerSource = new ObjectDiscoveryPeerSource(resources.mesh, this, resources.config.linkupServers, LinkupAddress.fromURL(localPeer.endpoint, localPeer.identity), resources.getEndointParserForDiscovery());
            
            this._peerGroup = {
                id: this.getLastHash(),
                localPeer: localPeer,
                peerSource: peerSource
            };

            const peerGroup = this._peerGroup;

            for (let page of (this.pages?.values() || [])) {
                console.log('starting sync page ' + page?.getLastHash())
                await this._node?.sync(page.blocks as MutableArray<Block>, SyncMode.single, peerGroup);
                page.addMutationObserver(this._pagesObserver);
                await page.loadAndWatchForChanges();
                for (let block of page.blocks?.contents()!) {
                    console.log('starting sync block ' + block?.getLastHash())
                    await this._node?.sync(block.contents as MutableReference<string>, SyncMode.single, peerGroup);
                    block.cascadeMutableContentEvents();
                    await block.loadAndWatchForChanges();
                }
            }

            await this._node.broadcast(this);
            await this._node.sync(this.pages as MutableSet<Page>, SyncMode.single, peerGroup);

            console.log('done starting sync of wiki ' + this.getLastHash());
        }
    }

    async stopSync(): Promise<void> {

        if (this._node !== undefined) {

            console.log('stopping sync of wiki ' + this.getLastHash());

            for (let page of (this.pages?.values() || [])) {
                console.log('stopping sync page ' + page?.getLastHash())
                await this._node?.stopSync(page.blocks as MutableArray<Block>, this._peerGroup?.id as string);
                await page.dontWatchForChanges();
                for (let block of page.blocks?.contents()!) {
                    console.log('stopping sync block ' + block?.getLastHash())
                    await this._node?.stopSync(block.contents as MutableReference<string>, this._peerGroup?.id as string);
                    await block.dontWatchForChanges();
                }
            }

            await this._node?.stopBroadcast(this);
            await this._node?.stopSync(this.pages as MutableSet<Page>, this._peerGroup?.id as string);
            this._node = undefined;

        }

        console.log('done stopping sync of wiki ' + this.getLastHash());
    }

    /*
    getIndex() {
        return this._index as Page;
    }*/

    getPages() {
        return this.pages as MutableSet<Page>;
    }

    hasPage(pageName: string) {
        return this.getPage(pageName) !== undefined;
    }
    
    getPage(pageName: string) {

        // create the page we want to navigate to, so we can figure out its hash
        let page = new Page(pageName, this);

        // and try to get it from the wiki
        const existingPage = this.pages?.get(page.hash());

        return existingPage;
    }

    getAllowedPages(): Set<Page> {
        const allowed = new Set<Page>();

        for (const page of this.pages?.values()!) {
            if (!this.offendingPages?.has(page)) {
                allowed.add(page);
            }
        }

        return allowed;
    }

    isAllowedIdentity(id: Identity) {
        return !this.offendingAuthors?.has(id);
    }

    createPage(pageName: string) {
        const page = new Page(pageName, this);

        if (this.hasResources()) {
            page.setResources(this.getResources()!);
        }

        return page;
    }

    async createWelcomePage(title: string) {
        const welcomePage = this.createPage('Welcome');
        const welcomeBlock = new Block();
        welcomeBlock.setId('welcome-block-for-' + this.hash());
        await welcomeBlock.contents?.setValue('This is the first page of "' + title + '".');
        await this.pages?.add(welcomePage);
        await this.pages?.save();
        await welcomePage.blocks?.push(welcomeBlock);
        await welcomePage.save();
        await welcomeBlock.contents?.save();
    }

    async addPage(page: Page) {
        if (page.wiki !== this) {
            throw new Error('Trying to add a page blonging to a different wiki');
        }

        await this.pages?.add(page);
        await this.pages?.save();
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
                    await this._node.sync(page.blocks as MutableArray<Block>, SyncMode.single, this._peerGroup);
                    page.addMutationObserver(this._pagesObserver);
                    await page.loadAndWatchForChanges();
                    
                    for (let block of page.blocks?.contents()!) {
                        if (this._node) console.log('starting sync block (obs-init) ' + block?.getLastHash());
                        await this._node?.sync(block.contents as MutableReference<string>, SyncMode.single, this._peerGroup);
                        await block.loadAndWatchForChanges();
                    }
                }
            } else if (ev.action === MutableContentEvents.RemoveObject) {
                if (this._node) {
                    const page = ev.data as Page;
                    if (this._node) console.log('stopping page syncing (obs) ' + page?.getLastHash())
                    this._node.stopSync(page.blocks as MutableArray<Block>, this._peerGroup?.id);
                    page.dontWatchForChanges();
                    page.removeMutationObserver(this._pagesObserver);
                    for (let block of page.blocks?.contents()!) {
                        if (this._node) console.log('stopping sync block (obs-init) ' + block?.getLastHash())
                        await this._node?.stopSync(block.contents as MutableReference<string>, this._peerGroup?.id);
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
                    await this._node?.sync(block.contents as MutableReference<string>, SyncMode.single, this._peerGroup);
                    await block.loadAndWatchForChanges();
                }
            } else if (ev.action === MutableContentEvents.RemoveObject) {
                if (this._node) {
                    if (this._node) console.log('stopping block syncing (obs) ' + block?.getLastHash())
                    await this._node.stopSync(block.contents as MutableReference<string>, this._peerGroup?.id);
                    block.dontWatchForChanges();
                }
            }
        }
    }
}

ClassRegistry.register(WikiSpace.className, WikiSpace);

export { WikiSpace };
