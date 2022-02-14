import { HashedObject, MutableReference, SpaceEntryPoint } from '@hyper-hyper-space/core';


class SomeSpace extends HashedObject implements SpaceEntryPoint {

    static className = 'enter-your-class-name';

    contents: MutableReference<any>;

    constructor() {
        super();
        
        this.contents = new MutableReference();
    }

    getClassName(): string {
        // return SomeSpace.className;
        throw new Error('Method not implemented.');
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

export { SomeSpace };