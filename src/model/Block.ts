import { ClassRegistry, HashedObject, MutableReference } from '@hyper-hyper-space/core';


enum BlockType {
    Title = 'title',
    Text  = 'text',
    Image = 'Image'
}

class Block extends HashedObject {

    static className = 'hhs-wiki/v0/Block';

    type?: BlockType;
    contents?: MutableReference<string>;

    constructor(type: BlockType = BlockType.Text) {
        super();

        this.setRandomId();
        this.addDerivedField('contents', new MutableReference<string>())
        this.type = type;
    }

    getClassName(): string {
        return Block.className;
    }

    init(): void {
        
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        // todo: editing authorization
        return true;
    }

}

ClassRegistry.register(Block.className, Block);

export { Block, BlockType };