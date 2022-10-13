import { ClassRegistry, HashedObject, Identity, MutableReference } from '@hyper-hyper-space/core';


enum BlockType {
    Title = 'title',
    Text  = 'text',
    Image = 'Image'
}

class Block extends HashedObject {

    static className = 'hhs-wiki/v0/Block';

    type?: BlockType;
    contents?: MutableReference<string>;

    constructor(type: BlockType = BlockType.Text, author?: Identity) {
        super();

        this.setAuthor(author!);
        this.setRandomId();
        const contents = new MutableReference<string>({writer: this.getAuthor()})
        this.addDerivedField('contents', contents)
        this.type = type;
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

}

ClassRegistry.register(Block.className, Block);

export { Block, BlockType };