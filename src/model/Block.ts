import { Authorizer, CausalReference, CausalSet, ClassRegistry, HashedObject, HashedSet, Identity } from '@hyper-hyper-space/core';
import { PermFlag, WikiSpace } from './WikiSpace';


enum BlockType {
    Title = 'title',
    Text  = 'text',
    Image = 'Image'
}

class Block extends CausalReference<string> {

    static className = 'hhs-wiki/v0/Block';

    type?: BlockType;
    writeConfig?: CausalSet<PermFlag>;

    constructor(type: BlockType = BlockType.Text, wiki?: WikiSpace) {
        super(wiki? {writers: wiki.owners?.values(), mutableWriters: wiki.members, acceptedTypes: ['string']} : {});

        if (wiki !== undefined) {
            this.setRandomId();
            this.type = type;
            this.writeConfig = wiki.writeConfig;
        }
    }

    getClassName(): string {
        return Block.className;
    }

    init(): void {
        
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        // todo: editing authorization

        // return this.contents?.getAuthor();
        return true;
    }

    protected createUpdateAuthorizer(author?: Identity): Authorizer {
        const owners  = this.writers as HashedSet<Identity>;
        const members = this.mutableWriters as CausalSet<Identity>;
        const writeConfig = this.writeConfig as CausalSet<PermFlag>;

        return WikiSpace.createPermAuthorizer(owners, members, writeConfig, author);
    }

    canUpdate(author?: Identity) {
        return this.createUpdateAuthorizer(author).attempt();
    }
}

ClassRegistry.register(Block.className, Block);

export { Block, BlockType };