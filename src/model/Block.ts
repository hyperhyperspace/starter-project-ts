import { ClassRegistry, HashedObject, MutableReference } from '@hyper-hyper-space/core';


class Block extends HashedObject {

    static className = 'hhs-wiki/v0/Block';

    contents?: MutableReference<string>;

    constructor() {
        super();

        this.setRandomId();
        this.addDerivedField('contents', new MutableReference<string>())
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

export { Block };