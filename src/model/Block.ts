import { ClassRegistry, HashedObject } from '@hyper-hyper-space/core';


class Block extends HashedObject {

    static className = 'hhs-wiki/v0/Block';

    getClassName(): string {
        return Block.className;
    }

    init(): void {
        
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        return true;
    }

}

ClassRegistry.register(Block.className, Block);

export { Block };