import {
    CausalArray,
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
    MutationEvent,
    MutationObserver,
    ObjectDiscoveryPeerSource,
    PeerGroupInfo,
    SpaceEntryPoint,
    SyncMode,
} from "@hyper-hyper-space/core";
import { Block, BlockType } from "./Block";
import { Page } from "./Page";
import { PageArray } from "./PageArray";
import { PermissionLogic } from "./PermissionLogic";

class WikiSpace extends HashedObject implements SpaceEntryPoint {
  static className = "hhs-wiki/v0/WikiSpace";
  static version = "0.0.7";

  static logger = new Logger(WikiSpace.name, LogLevel.DEBUG);
  owners?: HashedSet<Identity>;
  permissionLogic?: PermissionLogic;

  title?: MutableReference<string>;
  pages?: PageArray;

  version?: string;

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

    this._processEventLock = new Lock();
    this._pendingEvents = [];

    this._pagesObserver = (ev: MutationEvent) => {
      this._pendingEvents.push(ev);
      this.processPendingEvents();
    };

    if (owners !== undefined) {
    // console.log('wiki with owners', [...owners])
      this.owners = new HashedSet<Identity>(owners);
    console.log('wiki.owners', [...this.owners.values()])

      this.setRandomId();
      this.addDerivedField(
        "title",
        new MutableReference<string>({ writers: this.owners.values() })
      );
      this.addDerivedField("permissionLogic", new PermissionLogic(this.owners.values()));
      console.log('added permissionLogic to', this, '...', this.permissionLogic)
      this.addDerivedField("pages", new PageArray(this.permissionLogic));

      if (title !== undefined) {
        this.title?.setValue(title);
      }

      this.version = WikiSpace.version;

      this.init();
    }

    this._synchronizing = false;
    this._shouldBeSynchronizing = false;
    this._syncLock = new Lock();

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
    this.addObserver(this._pagesObserver);
    /*if (this._index === undefined) {
            this._index = new Page("/", this);
        }*/
  }

  async validate(_references: Map<string, HashedObject>): Promise<boolean> {
    // When your object is received from the network, this method will be
    // called to verify its contents before accepting it into the local store.

    const another = new WikiSpace(this.owners?.values(), "title dont matter");

    another.setId(this.getId() as string);
    another.version = this.version;

    if (this.hasAuthor()) {
      another.setAuthor(this.getAuthor() as Identity);
    }

    return this.equals(another);
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
      WikiSpace.logger.debug("Wiki " + this.getLastHash() + ": starting sync");

      await this.loadAndWatchForChanges();

      this._node = new MeshNode(resources);

      const localPeer = resources.getPeersForDiscovery()[0];
      const peerSource = new ObjectDiscoveryPeerSource(
        resources.mesh,
        this,
        resources.config.linkupServers,
        LinkupAddress.fromURL(localPeer.endpoint, localPeer.identity),
        resources.getEndointParserForDiscovery()
      );

      this._peerGroup = {
        id: this.getLastHash(),
        localPeer: localPeer,
        peerSource: peerSource,
      };

      const peerGroup = this._peerGroup;

      for (let page of this.pages?.values() || []) {
        WikiSpace.logger.debug(
          "Wiki " + this.getLastHash() + ": starting sync of page " + page?.name
        );
        await this._node?.sync(
          page.blocks as CausalArray<Block>,
          SyncMode.single,
          peerGroup
        );
        page.addObserver(this._pagesObserver);
        await page.loadAndWatchForChanges();
        for (let block of page.blocks?.contents()!) {
          console.log(
            "Page " +
              page.name +
              ": starting sync block " +
              block?.getLastHash()
          );
          await this._node?.sync(block as Block, SyncMode.single, peerGroup);
          block.cascadeMutableContentEvents();
          await block.loadAndWatchForChanges();
        }
      }

      await this._node.broadcast(this);
      await this._node.sync(
        this.pages as CausalArray<Page>,
        SyncMode.single,
        peerGroup
      );
      await this._node.sync(
        this.title as MutableReference<string>,
        SyncMode.single,
        peerGroup
      );

      await this._node.sync(
        this.permissionLogic as PermissionLogic,
        SyncMode.recursive,
        peerGroup
      );
      await this._node.sync(
        this.pages as CausalArray<Page>,
        SyncMode.single,
        peerGroup
      );
      WikiSpace.logger.debug(
        "Wiki " + this.getLastHash() + ": done starting sync"
      );
    }
  }

  private async doStopSync(): Promise<void> {
    if (this._node !== undefined) {
      console.log("stopping sync of wiki " + this.getLastHash());

      for (let page of this.pages?.values() || []) {
        console.log("stopping sync page " + page?.getLastHash());
        await this._node?.stopSync(
          page.blocks as CausalArray<Block>,
          this._peerGroup?.id as string
        );
        await page.dontWatchForChanges();
        for (let block of page.blocks?.contents()!) {
          console.log("stopping sync block " + block?.getLastHash());
          await this._node?.stopSync(
            block as Block,
            this._peerGroup?.id as string
          );
          await block.dontWatchForChanges();
        }
      }

      await this._node?.stopBroadcast(this);
      await this._node?.stopSync(
        this.pages as CausalArray<Page>,
        this._peerGroup?.id as string
      );
      await this._node?.stopSync(
        this.title as MutableReference<string>,
        this._peerGroup?.id as string
      );
      await this._node?.stopSync(
        this.permissionLogic as PermissionLogic,
        this._peerGroup?.id as string
      );
      await this._node?.stopSync(
        this.pages as CausalArray<Page>,
        this._peerGroup?.id as string
      );
      this._node = undefined;
    }

    console.log("done stopping sync of wiki " + this.getLastHash());
  }

  /*
    getIndex() {
        return this._index as Page;
    }*/

  getPages() {
    return this.pages as CausalArray<Page>;
  }

  hasPage(pageName: string) {
    return this.getPage(pageName) !== undefined;
  }

  getPage(pageName: string) {
    // create the page we want to navigate to, so we can figure out its hash
    let page = new Page(pageName, this.permissionLogic, this.hash());

    // and try to get it from the wiki
    const existingPage = this.pages?.get(page.hash());

    return existingPage;
  }

  //deprecated FIXME
  getAllowedPages(): Set<Page> {
    const allowed = new Set<Page>();

    for (const page of this.pages?.values()!) {
      //if (!this.offendingPages?.hasByHash(page.getLastHash())) {
      allowed.add(page);
      //}
    }

    return allowed;
  }

  //deprecated FIXME
  isAllowedIdentity(_id: Identity) {
    return true; //!this.offendingAuthors?.hasByHash(id.getLastHash());
  }

  createPage(pageName: string) {
    const page = new Page(pageName, this.permissionLogic, this.hash());

    if (this.hasResources()) {
      page.setResources(this.getResources()!);
    }

    return page;
  }

  async createWelcomePage(title: string, author: Identity) {
    const welcomePage = this.createPage("Welcome");
    const welcomeBlock = new Block(BlockType.Text, this.permissionLogic);
    welcomeBlock.setId("welcome-block-for-" + this.hash());
    await welcomeBlock.setValue(
      'This is the first page of "' + title + '".',
      author
    );
    await this.pages?.insertAt(welcomePage, 0, author);
    await this.pages?.save();
    await welcomePage.blocks?.push(welcomeBlock, author);
    await welcomePage.save();
    await welcomeBlock.save();
  }

  async addPage(page: Page, author: Identity) {
    if (page.wikiHash !== this.hash()) {
      throw new Error("Trying to add a page blonging to a different wiki");
    }

    await this.pages?.insertAt(page, this.pages?.size() || 0, author);
    await this.pages?.save();
  }

  async movePage(from: number, to: number, author?: Identity) {
    console.log("moving page from", from, "to", to);
    const page = this.pages?.valueAt(from);
    if (page) {
      //await this.blocks?.deleteAt(from); // shouldn't need this - I think we don't!
      await this.pages?.insertAt(page, to, author);
      await this.pages?.save();
      return to;
    } else {
      return from;
    }
  }

  async navigateTo(pageName: string, author: Identity) {
    // create the page we want to navigate to, so we can figure out its hash
    let page = new Page(pageName, this.permissionLogic, this.hash());

    // and try to get it from the wiki
    const existingPage = this.pages?.get(page.hash());

    if (existingPage !== undefined) {
      page = existingPage;
    } else {
      // if the page is not there, add it to the wiki

      if (this.hasResources()) {
        page.setResources(this.getResources()!);
      }

      await this.pages?.insertAt(page, 0, author);
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
      // handle adding a page
      if (ev.action === MutableContentEvents.AddObject) {
        if (this._node) {
          const page = ev.data as Page;

          if (this._node)
            console.log("starting to sync page (obs) " + page?.getLastHash());
          await this._node.sync(
            page.blocks as CausalArray<Block>,
            SyncMode.single,
            this._peerGroup
          );
          page.addObserver(this._pagesObserver);
          await page.loadAndWatchForChanges();

          for (let block of page.blocks?.contents()!) {
            if (this._node)
              console.log(
                "starting sync block (obs-init) " + block?.getLastHash()
              );
            await this._node?.sync(
              block as Block,
              SyncMode.single,
              this._peerGroup
            );
            await block.loadAndWatchForChanges();
          }
        }
      // handle removing a page
      } else if (ev.action === MutableContentEvents.RemoveObject) {
        if (this._node) {
          const page = ev.data as Page;
          if (this._node)
            console.log("stopping page syncing (obs) " + page?.getLastHash());
          this._node.stopSync(
            page.blocks as CausalArray<Block>,
            this._peerGroup?.id
          );
          page.dontWatchForChanges();
          page.removeObserver(this._pagesObserver);
          for (let block of page.blocks?.contents()!) {
            if (this._node)
              console.log(
                "stopping sync block (obs-init) " + block?.getLastHash()
              );
            await this._node?.stopSync(block as Block, this._peerGroup?.id);
            block.dontWatchForChanges();
          }
        }
      // handle restoring from a checkpoint
      } else if (ev.action === MutableContentEvents.RestoredCheckpoint) {
        if (this._node) {
          await Promise.all([...this.pages?.contents()!].map(async (page) => {
            if (this._node)
              console.log("starting to sync page (obs) " + page?.getLastHash());
            this._node!.sync(
              page.blocks as CausalArray<Block>,
              SyncMode.single,
            );
            page.addObserver(this._pagesObserver);

            return Promise.all([page.loadAndWatchForChanges(), ...[...page.blocks?.contents()!].map(async (block) => {
              if (this._node)
                console.log(
                  "starting sync block (obs-init) " + block?.getLastHash()
                );
              this._node?.sync(
                block as Block,
                SyncMode.single,
              );
              return block.loadAndWatchForChanges();
            })]);
          }));
        }
      }
    }
    if (ev.data instanceof Block) {
      const block = ev.data as Block;
      if (ev.action === MutableContentEvents.AddObject) {
        if (this._node) {
          if (this._node)
            console.log("starting to sync block (obs) " + block?.getLastHash());
          await this._node?.sync(
            block as Block,
            SyncMode.single,
            this._peerGroup
          );
          await block.loadAndWatchForChanges();
        }
      } else if (ev.action === MutableContentEvents.RemoveObject) {
        if (this._node) {
          if (this._node)
            console.log("stopping block syncing (obs) " + block?.getLastHash());
          await this._node.stopSync(block as Block, this._peerGroup?.id);
          block.dontWatchForChanges();
        }
      }
    }
  }

  getName() {
    return this.title;
  }

  getVersion(): string {
    return this.version as string;
  }
}

ClassRegistry.register(WikiSpace.className, WikiSpace);

export { WikiSpace };
