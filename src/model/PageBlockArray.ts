import { Authorization, Authorizer, CausalArray, CausalSet, ClassRegistry, Identity } from '@hyper-hyper-space/core';

import { WikiSpace } from './WikiSpace';
import { Block } from './Block';

class PageBlockArray extends CausalArray<Block> {
    static className = "hhs-wiki/v0/PageBlockArray";
    editFlags?: CausalSet<string>;

    constructor(owners?: IterableIterator<Identity>, editors?: CausalSet<Identity>, editFlags?: CausalSet<string>) {
        super({acceptedTypes: [Block.className], writers: owners, mutableWriters: editors, duplicates: false});

        if (editFlags !== undefined) {
            this.editFlags = editFlags;
        }
    }

    getClassName() {
        return PageBlockArray.className;
    }

    protected createWriteAuthorizer(author?: Identity): Authorizer {

        const openlyEditableAuth = (this.editFlags as CausalSet<string>).createMembershipAuthorizer(WikiSpace.OpenlyEditableFlag);

        return Authorization.oneOf([super.createWriteAuthorizer(author), openlyEditableAuth]);
    }

}

ClassRegistry.register(PageBlockArray.className, PageBlockArray);

export { PageBlockArray };