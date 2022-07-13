import { ClassRegistry, HashedObject, Hashing, Identity, MutableArray, MutableReference } from '@hyper-hyper-space/core';
import { Block } from './Block';
import { WikiSpace } from './WikiSpace';

class Page extends HashedObject {

    static className = 'hhs-wiki/v0/Page';

    wiki?: WikiSpace;
    name?: MutableReference<string>;
    blocks?: MutableArray<Block>;

    constructor(name?: string, wiki?: WikiSpace, owner?: Identity) {
        super();
        
        if (name !== undefined && wiki !== undefined) {
            this.wiki = wiki;
            this.name = new MutableReference<string>();
            this.name.setValue(name);
            this.setId(Hashing.forString(this.wiki.hash() + '_' + this.name.getValue()))
        }


        if (owner !== undefined) {
            this.setAuthor(owner);
        } else if (this.wiki?.hasAuthor()) {
            this.setAuthor(this.wiki?.getAuthor()!);
        }
    }

    getClassName(): string {
        return Page.className;
    }

    init(): void {
        
    }

    async validate(_references: Map<string, HashedObject>): Promise<boolean> {
        return true;
    }

}

ClassRegistry.register(Page.className, Page);

export { Page };