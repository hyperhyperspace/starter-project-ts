import { Authorization, Authorizer, CausalArray, CausalSet, Identity } from '@hyper-hyper-space/core';

import { WikiSpace } from './WikiSpace';
import { Block } from './Block';

class PageBlockArray extends CausalArray<Block> {

    editors?: CausalSet<Identity>;
    editFlags?: CausalSet<string>;

    constructor(editors?: CausalSet<Identity>, editFlags?: CausalSet<string>) {
        super({acceptedTypes: [Block.className], duplicates: false});

        if (editors !== undefined && editFlags !== undefined) {
            this.editors = editors;
            this.editFlags = editFlags;
        }
    }

    protected createWriteAuthorizer(author?: Identity): Authorizer {

        const authOptions = [(this.editFlags as CausalSet<string>).createMembershipAuthorizer(WikiSpace.OpenlyEditableFlag)];

        if (author !== undefined) {
            authOptions.push((this.editors as CausalSet<Identity>).createMembershipAuthorizer(author));
        }

        return Authorization.oneOf(authOptions);
    }

}

export { PageBlockArray };