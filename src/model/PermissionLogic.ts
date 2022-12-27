import {
    Authorization,
    Authorizer,
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
    MutableReference,
    ObjectDiscoveryPeerSource,
    PeerGroupInfo,
    SyncMode,
} from "@hyper-hyper-space/core";
import { Page } from "./Page";
import { PageArray } from "./PageArray";

export const PermFlagMembers = 'members'
export const PermFlagModerators = 'moderators'
export const PermFlagOwners = 'owners'
export const PermFlagEveryone = 'everyone'
type PermFlag = typeof PermFlagEveryone | typeof PermFlagMembers | typeof PermFlagModerators | typeof PermFlagOwners;

class PermissionLogic extends HashedObject {
  static className = "hhs-wiki/v0/PermissionLogic";
  static version = "0.0.5";

  static logger = new Logger(PermissionLogic.name, LogLevel.DEBUG);

  static permFlags: PermFlag[] = [
    PermFlagMembers,
    PermFlagEveryone,
    PermFlagModerators,
    PermFlagOwners,
  ];

  owners?: HashedSet<Identity>;
  moderators?: CausalSet<Identity>;
  members?: CausalSet<Identity>;
  //editFlags?: CausalSet<string>;

  readConfig?: CausalSet<PermFlag>;
  writeConfig?: CausalSet<PermFlag>;

  version?: string;

  _node?: MeshNode;

  title?: MutableReference<string>;
  pages?: PageArray;

  _peerGroup?: PeerGroupInfo;

  _synchronizing: boolean;
  _shouldBeSynchronizing: boolean;
  _syncLock: Lock;

  _syncingPages: Set<Hash>;
  _syncingBlocksPerPage: MultiMap<Hash, Hash>;

  constructor(owners?: IterableIterator<Identity>) {
    super();

    // this.pages = new MutableSet<Page>();

    // this._processEventLock = new Lock();
    // this._pendingEvents    = [];

    if (owners !== undefined) {
      // this.setAuthor(owner);

      this.owners = new HashedSet<Identity>(owners);

      this.addDerivedField(
        "moderators",
        new CausalSet<Identity>({ writers: this.owners.values() })
      );
      this.addDerivedField(
        "members",
        new CausalSet<Identity>({
          writers: this.owners.values(),
          mutableWriters: this.moderators,
        })
      );
      this.addDerivedField(
        "readConfig",
        new CausalSet<PermFlag>({
          writers: this.owners.values(),
          // mutableWriters: this.moderators,
          acceptedElements: PermissionLogic.permFlags,
        })
      );
      this.addDerivedField(
        "writeConfig",
        new CausalSet<PermFlag>({
          writers: this.owners.values(),
          // mutableWriters: this.moderators,
          acceptedElements: PermissionLogic.permFlags,
        })
      );
      // this.version = PermissionLogic.version;

      this.init();
    }

    this._synchronizing = false;
    this._shouldBeSynchronizing = false;
    this._syncLock = new Lock();

    this._syncingPages = new Set();
    this._syncingBlocksPerPage = new MultiMap();
  }

  getClassName(): string {
    return PermissionLogic.className;
  }

  init(): void {
    // After your object is sent over the network and reconstructed on another peer, or
    // after loading it from the store, this method will be called to perform any necessary
    // initialization.
    //this.pages?.cascadeMutableContentEvents();
    // this.addObserver(this._pagesObserver);
    /*if (this._index === undefined) {
            this._index = new Page("/", this);
        }*/
  }

  async validate(_references: Map<string, HashedObject>): Promise<boolean> {
    // When your object is received from the network, this method will be
    // called to verify its contents before accepting it into the local store.

    const another = new PermissionLogic(this.owners?.values());

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
      PermissionLogic.logger.debug("Wiki " + this.getLastHash() + ": starting sync");

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

      await this._node.broadcast(this);
      await this._node.sync(
        this.pages as CausalArray<Page>,
        SyncMode.single,
        peerGroup
      );
      await this._node.sync(
        this.readConfig as CausalSet<PermFlag>,
        SyncMode.single,
        peerGroup
      );
      await this._node.sync(
        this.writeConfig as CausalSet<PermFlag>,
        SyncMode.single,
        peerGroup
      );
      await this._node.sync(
        this.members as CausalSet<Identity>,
        SyncMode.single,
        peerGroup
      );
      await this._node.sync(
        this.moderators as CausalSet<Identity>,
        SyncMode.single,
        peerGroup
      );
      await this._node.sync(
        this.title as MutableReference<string>,
        SyncMode.single,
        peerGroup
      );

      PermissionLogic.logger.debug(
        "Wiki " + this.getLastHash() + ": done starting sync"
      );
    }
  }

  private async doStopSync(): Promise<void> {
    if (this._node !== undefined) {
      console.log("stopping sync of wiki permission info" + this.getLastHash());
      await this._node?.stopBroadcast(this);
      await this._node?.stopSync(
        this.pages as CausalArray<Page>,
        this._peerGroup?.id as string
      );
      await this._node?.stopSync(
        this.readConfig as CausalSet<PermFlag>,
        this._peerGroup?.id as string
      );
      await this._node?.stopSync(
        this.writeConfig as CausalSet<PermFlag>,
        this._peerGroup?.id as string
      );
      await this._node?.stopSync(
        this.members as CausalSet<Identity>,
        this._peerGroup?.id as string
      );
      await this._node?.stopSync(
        this.moderators as CausalSet<Identity>,
        this._peerGroup?.id as string
      );
      await this._node?.stopSync(
        this.title as MutableReference<string>,
        this._peerGroup?.id as string
      );
      this._node = undefined;
    }

    console.log("done stopping sync of wiki " + this.getLastHash());
  }

  //deprecated FIXME
  isAllowedIdentity(_id: Identity) {
    return true; //!this.offendingAuthors?.hasByHash(id.getLastHash());
  }

  static createPermAuthorizer(
    owners: HashedSet<Identity>,
    moderators: CausalSet<Identity>,
    members: CausalSet<Identity>,
    permConfig: CausalSet<PermFlag>,
    author?: Identity
  ): Authorizer {
    let identityAuth: Authorizer;

    if (owners.size() === 0) {
      // there are no owners, so it's an open wiki
      identityAuth = Authorization.always;
    } else if (author !== undefined) {
      if (owners.has(author)) {
        identityAuth = Authorization.always;
      } else {
        const memberAuth =
          permConfig.createMembershipAuthorizer(PermFlagMembers);
        const moderatorAuth = 
          permConfig.createMembershipAuthorizer(PermFlagModerators);
        identityAuth = 
          Authorization.oneOf([
            Authorization.all([
              memberAuth,
              members.createMembershipAuthorizer(author),
            ]),
            Authorization.all([
              moderatorAuth,
              moderators.createMembershipAuthorizer(author),
            ]),
          ])
      }
    } else {
      identityAuth = Authorization.never;
    }

    const anonymousAuth =
      permConfig.createMembershipAuthorizer(PermFlagEveryone);

    return Authorization.oneOf([identityAuth, anonymousAuth]);
  }

  createUpdateAuthorizer(author?: Identity): Authorizer {
    const owners = this.owners as HashedSet<Identity>;
    const moderators = this.moderators as CausalSet<Identity>;
    const members = this.members as CausalSet<Identity>;
    const writeConfig = this.writeConfig as CausalSet<PermFlag>;

    return PermissionLogic.createPermAuthorizer(owners, moderators, members, writeConfig, author);
  }
}

ClassRegistry.register(PermissionLogic.className, PermissionLogic);

export { PermissionLogic };
export type { PermFlag };
