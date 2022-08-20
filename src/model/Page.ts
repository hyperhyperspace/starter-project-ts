import {
  ClassRegistry,
  HashedObject,
  Hashing,
  MutableArray,
} from "@hyper-hyper-space/core";
import { Block } from "./Block";
import { WikiSpace } from "./WikiSpace";

class Page extends HashedObject {
  static className = "hhs-wiki/v0/Page";

  wiki?: WikiSpace;
  name?: string;
  blocks?: MutableArray<Block>;
  titleBlock?: Block;

  constructor(name?: string, wiki?: WikiSpace) {
    super();

    if (name !== undefined && wiki !== undefined) {
      this.wiki = wiki;
      this.name = name;
      this.setId(
        Hashing.forString(this.wiki.hash() + "_" + this.name)
      );
      this.addDerivedField('blocks', new MutableArray<Block>({duplicates: false, writer: undefined}));
      this.addDerivedField('titleBlock', new Block());
    }
  }

  async addBlock(idx?: number) {
    const block = new Block();
    if (this.hasResources()) {
      block.setResources(this.getResources()!);
    }

    if (idx === undefined) {
      await this.blocks?.push(block);
    } else {
      await this.blocks?.insertAt(block, idx);
    }
    
    await this.blocks?.saveQueuedOps();
    
    if (!this.wiki?.hasPage(this.name as string)) {
      await this.wiki?.pages?.add(this);
      await this.wiki?.pages?.save();  
    }
    return block;
  }
  
  async moveBlock(from: number, to: number) {
    console.log('moving block from', from, 'to', to)
    const block = this.blocks?.valueAt(from);
    if (block) {
        //await this.blocks?.deleteAt(from); // shouldn't need this - I think we don't!
        await this.blocks?.insertAt(block, to);
        await this.blocks?.save();
        return to
    } else {
      return from
    }
  }

  getClassName(): string {
    return Page.className;
  }

  init(): void {}

  async validate(_references: Map<string, HashedObject>): Promise<boolean> {
    if (this.wiki === undefined) {
        return false;
    }

    if (this.name === undefined) {
        return false;
    }

    if (this.blocks === undefined) {
        return false;
    }

    if (this.getId() !== Hashing.forString(this.wiki.hash() + "_" + this.name)) {
        return false;
    }

    return true;
  }
}

ClassRegistry.register(Page.className, Page);

export { Page };
