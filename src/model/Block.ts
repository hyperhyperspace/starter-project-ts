import { Authorizer, CausalReference, ClassRegistry, HashedObject, Identity } from '@hyper-hyper-space/core';
import { WikiSpace } from './WikiSpace';


enum BlockType {
    Title = 'title',
    Text  = 'text',
    Image = 'Image'
}

class Block extends CausalReference<string> {

    static className = 'hhs-wiki/v0/Block';

    type?: BlockType;
    wiki?: WikiSpace;

    constructor(type: BlockType = BlockType.Text, wiki?: WikiSpace) {
        super(wiki? {writers: wiki.owners?.values(), acceptedTypes: ['string']} : {});
        this.wiki = wiki;
        if (wiki !== undefined) {
            this.setRandomId();
            this.type = type;
        }
    }

    getClassName(): string {
        return Block.className;
    }

    init(): void {
        
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        const another = new Block(this.type, this.wiki);

        another.setId(this.getId() as string);

        if (this.hasAuthor()) {
            another.setAuthor(this.getAuthor() as Identity);
        }

        return this.equals(another);
    }

    protected createUpdateAuthorizer(author?: Identity): Authorizer {
        return this.wiki?.permissionLogic?.createUpdateAuthorizer(author)!;
    }

    canUpdate(author?: Identity) {
        return this.createUpdateAuthorizer(author).attempt();
    }
}

ClassRegistry.register(Block.className, Block);

export { Block, BlockType };