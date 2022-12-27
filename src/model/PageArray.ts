import { Authorizer, CausalArray, ClassRegistry, HashedObject, HashedSet, Identity } from '@hyper-hyper-space/core';

import { Page } from './Page';
import { PermissionLogic } from './PermissionLogic';

class PageArray extends CausalArray<Page> {
    static className = "hhs-wiki/v0/PageArray";
    permissionLogic?: PermissionLogic;
    
    constructor(permissionLogic?: PermissionLogic) {
        const owners  = permissionLogic?.owners as HashedSet<Identity>;
        super({acceptedTypes: [Page.className], writers: owners?.values(), duplicates: false});
        this.permissionLogic = permissionLogic;
    }

    getClassName() {
        return PageArray.className;
    }

    protected createWriteAuthorizer(author?: Identity): Authorizer {
        return this.permissionLogic?.createUpdateAuthorizer(author)!;
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        const PermissionLogic  = this.permissionLogic;
        const another = new PageArray(PermissionLogic);

        another.setId(this.getId() as string);

        if (this.hasAuthor()) {
            another.setAuthor(this.getAuthor() as Identity);
        }

        return this.equals(another);
    }

    // FIXME: shouldAcceptMutationOp

}

ClassRegistry.register(PageArray.className, PageArray);

export { PageArray as PageArray };