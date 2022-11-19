import { Authorizer, CausalSet, ClassRegistry, HashedSet, Identity } from '@hyper-hyper-space/core';

import { WikiSpace, PermFlag } from './WikiSpace';
import { Page } from './Page';

class PageSet extends CausalSet<Page> {
    static className = "hhs-wiki/v0/PageSet";
    writeConfig?: CausalSet<PermFlag>;

    constructor(owners?: IterableIterator<Identity>, members?: CausalSet<Identity>, writeConfig?: CausalSet<PermFlag>) {
        super({acceptedTypes: [Page.className], writers: owners, mutableWriters: members});

        if (writeConfig !== undefined) {
            this.writeConfig = writeConfig;
        }
    }

    getClassName() {
        return PageSet.className;
    }

    protected createWriteAuthorizer(author?: Identity): Authorizer {

        const owners  = this.writers as HashedSet<Identity>;
        const members = this.mutableWriters as CausalSet<Identity>;
        const writeConfig = this.writeConfig as CausalSet<PermFlag>;

        return WikiSpace.createPermAuthorizer(owners, members, writeConfig, author);
    }

    // FIXME: validate, shouldAcceptMutationOp


}

ClassRegistry.register(PageSet.className, PageSet);

export { PageSet };