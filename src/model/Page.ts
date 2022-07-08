import { ClassRegistry, HashedObject } from '@hyper-hyper-space/core';


class Page extends HashedObject {

    static className = 'hhs-wiki/v0/Page';

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