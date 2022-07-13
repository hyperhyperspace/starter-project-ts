import { HashedObject, Identity, MutableArray, SpaceEntryPoint } from '@hyper-hyper-space/core';
import { Page } from './Page';

class WikiSpace extends HashedObject implements SpaceEntryPoint {

    static className = 'hhs-wiki/v0/WikiSpace';

    index?: Page;
    
    pages?: MutableArray<Page>;

    constructor(owner?: Identity) {
        super();
        
        if (owner !== undefined) {
            this.setAuthor(owner);

            this.index = new Page('/', this);
        }
    }

    getClassName(): string {
        return WikiSpace.className;
    }
    
    init(): void {
        
        // After your object is sent over the network and reconstructed on another peer, or 
        // after loading it from the store, this method will be called to perform any necessary
        // initialization.

    }
    
    async validate(_references: Map<string, HashedObject>): Promise<boolean> {

        // When your object is received from the network, this method will be
        // called to verify its contents before accepting it into the local store.
        
        return true;
    }
    
    startSync(): Promise<void> {
        throw new Error('Method not implemented.');
    }

    stopSync(): Promise<void> {
        throw new Error('Method not implemented.');
    }

}

export { WikiSpace };