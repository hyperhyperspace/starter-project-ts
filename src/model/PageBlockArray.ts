import { Authorizer, CausalArray, CausalSet, ClassRegistry, HashedSet, Identity } from '@hyper-hyper-space/core';

import { PermFlag, WikiSpace } from './WikiSpace';
import { Block } from './Block';

class PageBlockArray extends CausalArray<Block> {
    static className = "hhs-wiki/v0/PageBlockArray";
    writeConfig?: CausalSet<PermFlag>;

    constructor(owners?: IterableIterator<Identity>, editors?: CausalSet<Identity>, writeConfig?: CausalSet<PermFlag>) {
        super({acceptedTypes: [Block.className], writers: owners, mutableWriters: editors, duplicates: false});

        if (writeConfig !== undefined) {
            this.writeConfig = writeConfig;
        }
    }

    getClassName() {
        return PageBlockArray.className;
    }

    protected createWriteAuthorizer(author?: Identity): Authorizer {

        const owners  = this.writers as HashedSet<Identity>;
        const members = this.mutableWriters as CausalSet<Identity>;
        const writeConfig = this.writeConfig as CausalSet<PermFlag>;

        return WikiSpace.createPermAuthorizer(owners, members, writeConfig, author);
    }

}

ClassRegistry.register(PageBlockArray.className, PageBlockArray);

export { PageBlockArray };