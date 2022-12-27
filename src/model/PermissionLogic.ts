import {
    Authorization,
    Authorizer,
    CausalSet,
    ClassRegistry,
    Hash,
    HashedObject,
    HashedSet,
    Identity,
    Lock,
    Logger,
    LogLevel,
    MeshNode,
    MultiMap,
    MutableReference,
    PeerGroupInfo,
} from "@hyper-hyper-space/core";
import { PageArray } from "./PageArray";

export const PermFlagMembers = 'members'
export const PermFlagModerators = 'moderators'
export const PermFlagOwners = 'owners'
export const PermFlagEveryone = 'everyone'
type PermFlag = typeof PermFlagEveryone | typeof PermFlagMembers | typeof PermFlagModerators | typeof PermFlagOwners;

class PermissionLogic extends HashedObject {
  static className = "hhs-wiki/v0/PermissionLogic";

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

    if (owners !== undefined) {

      this.owners = new HashedSet<Identity>(owners);
      // console.log('setting up permission logic object', [...owners], this.owners, [...this.owners.values()])

      this.addDerivedField(
        "moderators",
        new CausalSet<Identity>({ writers: owners })
      );
      console.log('permission logic moderators', this.moderators)
      this.addDerivedField(
        "members",
        new CausalSet<Identity>({
          writers: this.owners.values(),
          mutableWriters: this.moderators,
        })
      );
      console.log('permission logic members', this.members)
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
