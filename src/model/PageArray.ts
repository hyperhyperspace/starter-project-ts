import { Authorizer, CausalArray, CausalSet, ClassRegistry, HashedSet, Identity } from '@hyper-hyper-space/core';

import { WikiSpace, PermFlag } from './WikiSpace';
import { Page } from './Page';

class PageArray extends CausalArray<Page> {
    static className = "hhs-wiki/v0/PageArray";
    writeConfig?: CausalSet<PermFlag>;

    constructor(owners?: IterableIterator<Identity>, members?: CausalSet<Identity>, writeConfig?: CausalSet<PermFlag>) {
        super({acceptedTypes: [Page.className], writers: owners, mutableWriters: members, duplicates: false});

        if (writeConfig !== undefined) {
            this.writeConfig = writeConfig;
        }
    }

    getClassName() {
        return PageArray.className;
    }

    protected createWriteAuthorizer(author?: Identity): Authorizer {

        const owners  = this.writers as HashedSet<Identity>;
        const members = this.mutableWriters as CausalSet<Identity>;
        const writeConfig = this.writeConfig as CausalSet<PermFlag>;

        return WikiSpace.createPermAuthorizer(owners, members, writeConfig, author);
    }

    // FIXME: validate, shouldAcceptMutationOp


}

ClassRegistry.register(PageArray.className, PageArray);

export { PageArray as PageArray };