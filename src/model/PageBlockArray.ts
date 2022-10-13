import { Authorization, Authorizer, CausalArray, CausalSet, Identity } from '@hyper-hyper-space/core';

import { WikiSpace } from './WikiSpace';
import { Block } from './Block';

class PageBlockArray extends CausalArray<Block> {

    editFlags?: CausalSet<string>;

    constructor(owners?: IterableIterator<Identity>, editors?: CausalSet<Identity>, editFlags?: CausalSet<string>) {
        super({acceptedTypes: [Block.className], writers: owners, mutableWriters: editors, duplicates: false});

        if (editFlags !== undefined) {
            this.editFlags = editFlags;
        }
    }

    protected createWriteAuthorizer(author?: Identity): Authorizer {

        return Authorization.oneOf([(this.editFlags as CausalSet<string>).createMembershipAuthorizer(WikiSpace.OpenlyEditableFlag), super.createWriteAuthorizer(author)]);
    }

}

export { PageBlockArray };