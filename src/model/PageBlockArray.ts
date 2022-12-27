import { Authorizer, CausalArray, ClassRegistry, HashedSet, Identity } from '@hyper-hyper-space/core';

import { Block } from './Block';
import { PermissionLogic } from './PermissionLogic';

class PageBlockArray extends CausalArray<Block> {
    static className = "hhs-wiki/v0/PageBlockArray";
    permissionLogic?: PermissionLogic;
    
    constructor(permissionLogic?: PermissionLogic) {
        const owners  = permissionLogic?.owners as HashedSet<Identity>;
        super({acceptedTypes: [Block.className], writers: owners?.values(), duplicates: false});
        this.permissionLogic = permissionLogic;
    }

    getClassName() {
        return PageBlockArray.className;
    }

    protected createWriteAuthorizer(author?: Identity): Authorizer {
        return this.permissionLogic?.createUpdateAuthorizer(author)!;
    }

}

ClassRegistry.register(PageBlockArray.className, PageBlockArray);

export { PageBlockArray };