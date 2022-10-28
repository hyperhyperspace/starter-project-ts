import {
    CausalArray,
    CausalSet,
    ClassRegistry,
    Hash,
    HashedObject,
    HashedSet,
    Identity,
    LinkupAddress,
    Lock,
    Logger,
    LogLevel,
    MeshNode,
    MultiMap,
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

    static OpenlyEditableFlag = 'openly-editable';

    static logger = new Logger(WikiSpace.name, LogLevel.DEBUG);

    owners?: HashedSet<Identity>;
    editors?: CausalSet<Identity>;
    editFlags?: CausalSet<string>;

    title?: MutableReference<string>;
    pages?: CausalSet<Page>;

    offendingPages?: MutableSet<Page>;
    offendingAuthors?: MutableSet<Identity>;

    _pagesObserver: MutationObserver;
    _node?: MeshNode;

    _processEventLock: Lock;
    _pendingEvents: Array<MutationEvent>;

    _peerGroup?: PeerGroupInfo;

    _synchronizing: boolean;
    _shouldBeSynchronizing: boolean;
    _syncLock: Lock;

    _syncingPages: Set<Hash>;
    _syncingBlocksPerPage: MultiMap<Hash, Hash>;

    constructor(owners?: IterableIterator<Identity>, title?: string) {
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

        if (owners !== undefined) {

            // this.setAuthor(owner);

            this.owners = new HashedSet<Identity>(owners);

            this.setRandomId();
            this.addDerivedField('editors', new CausalSet<Identity>({writers: this.owners.values()}));
            this.addDerivedField('editFlags', new CausalSet<string>({writers: this.owners.values(), acceptedElements: [WikiSpace.OpenlyEditableFlag]}));
            this.addDerivedField('title', new MutableReference<string>({writers: this.owners.values()}));
            this.addDerivedField('pages', new CausalSet<Page>({writers: this.owners.values(), mutableWriters: this.editors}));
            this.addDerivedField('offendingPages', new CausalSet<Page>({writers: this.owners.values()}));
            this.addDerivedField('offendingAuthors', new CausalSet<Identity>({writers: this.owners.values()}));

            if (title !== undefined) {
                this.title?.setValue(title);
            }

            /*this._index = new Page("/", this);

            if (this.hasResources()) {
                this._index.setResources(this.getResources() as Resources);
            }

            this.pages?.add(this._index);*/

            this.init();
        }

        this._synchronizing = false;
        this._shouldBeSynchronizing = false;
        this._syncLock      = new Lock();

        this._syncingPages = new Set();
        this._syncingBlocksPerPage = new MultiMap();
    }

    getClassName(): string {
        return WikiSpace.className;
    }

    init(): void {
        // After your object is sent over the network and reconstructed on another peer, or
        // after loading it from the store, this method will be called to perform any necessary
        // initialization.
        //this.pages?.cascadeMutableContentEvents();
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
        this._shouldBeSynchronizing = true;
        await this.updateSyncState();
    }

    async stopSync(): Promise<void> {
        this._shouldBeSynchronizing = false;
        await this.updateSyncState();
    }

    async updateSyncState() {
        if (this._syncLock.acquire()) {
            try {
                while (this._synchronizing !== this._shouldBeSynchronizing) {
                    if (this._synchronizing) {
                        await this.doStopSync();
                    } else {
                        await this.doStartSync();
                    }

                    this._synchronizing = !this._synchronizing;
                }
            } finally {
                this._syncLock.release();
            }
        }
    }

    private async doStartSync(): Promise<void> {

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

            WikiSpace.logger.debug('Wiki ' + this.getLastHash() + ': starting sync');

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
                WikiSpace.logger.debug('Wiki ' + this.getLastHash() + ': starting sync of page ' + page?.name);
                await this._node?.sync(page.blocks as CausalArray<Block>, SyncMode.single, peerGroup);
                page.addMutationObserver(this._pagesObserver);
                await page.loadAndWatchForChanges();
                for (let block of page.blocks?.contents()!) {
                    console.log('Page ' + page.name + ': starting sync block ' + block?.getLastHash())
                    await this._node?.sync(block.contents as MutableReference<string>, SyncMode.single, peerGroup);
                    block.cascadeMutableContentEvents();
                    await block.loadAndWatchForChanges();
                }
            }

            await this._node.broadcast(this);
            await this._node.sync(this.pages as CausalSet<Page>, SyncMode.single, peerGroup);
            await this._node.sync(this.editFlags as CausalSet<string>, SyncMode.single, peerGroup);
            await this._node.sync(this.editors as CausalSet<Identity>, SyncMode.single, peerGroup);
            await this._node.sync(this.title as MutableReference<string>, SyncMode.single, peerGroup);

            WikiSpace.logger.debug('Wiki ' + this.getLastHash() + ': done starting sync');
        }
    }

    private async doStopSync(): Promise<void> {

        if (this._node !== undefined) {

            console.log('stopping sync of wiki ' + this.getLastHash());

            for (let page of (this.pages?.values() || [])) {
                console.log('stopping sync page ' + page?.getLastHash())
                await this._node?.stopSync(page.blocks as CausalArray<Block>, this._peerGroup?.id as string);
                await page.dontWatchForChanges();
                for (let block of page.blocks?.contents()!) {
                    console.log('stopping sync block ' + block?.getLastHash())
                    await this._node?.stopSync(block.contents as MutableReference<string>, this._peerGroup?.id as string);
                    await block.dontWatchForChanges();
                }
            }

            await this._node?.stopBroadcast(this);
            await this._node?.stopSync(this.pages as CausalSet<Page>, this._peerGroup?.id as string);
            await this._node?.stopSync(this.editFlags as CausalSet<string>, this._peerGroup?.id as string);
            await this._node?.stopSync(this.editors as CausalSet<Identity>, this._peerGroup?.id as string);
            await this._node?.stopSync(this.title as MutableReference<string>, this._peerGroup?.id as string);
            this._node = undefined;

        }

        console.log('done stopping sync of wiki ' + this.getLastHash());
    }

    /*
    getIndex() {
        return this._index as Page;
    }*/

    getPages() {
        return this.pages as CausalSet<Page>;
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
            if (!this.offendingPages?.hasByHash(page.getLastHash())) {
                allowed.add(page);
            }
        }

        return allowed;
    }

    isAllowedIdentity(id: Identity) {
        return !this.offendingAuthors?.hasByHash(id.getLastHash());
    }

    createPage(pageName: string) {
        const page = new Page(pageName, this);

        if (this.hasResources()) {
            page.setResources(this.getResources()!);
        }

        return page;
    }

    async createWelcomePage(title: string, author: Identity) {
        const welcomePage = this.createPage('Welcome');
        const welcomeBlock = new Block();
        welcomeBlock.setId('welcome-block-for-' + this.hash());
        await welcomeBlock.contents?.setValue('This is the first page of "' + title + '".');
        await this.pages?.add(welcomePage, author);
        await this.pages?.save();
        await welcomePage.blocks?.push(welcomeBlock, author);
        await welcomePage.save();
        await welcomeBlock.contents?.save();
    }

    async addPage(page: Page, author: Identity) {
        if (page.wiki !== this) {
            throw new Error('Trying to add a page blonging to a different wiki');
        }

        await this.pages?.add(page, author);
        await this.pages?.save();
    }

    async navigateTo(pageName: string, author: Identity) {

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

            await this.pages?.add(page, author);
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
                    await this._node.sync(page.blocks as CausalArray<Block>, SyncMode.single, this._peerGroup);
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
                    this._node.stopSync(page.blocks as CausalArray<Block>, this._peerGroup?.id);
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

    getName() {
        return this.title;
    }
}

ClassRegistry.register(WikiSpace.className, WikiSpace);

export { WikiSpace };
