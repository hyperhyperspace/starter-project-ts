import {
  ClassRegistry,
  HashedObject,
  Hashing,
  CausalArray,
  Identity,
} from "@hyper-hyper-space/core";
import { BlockType } from "..";
import { Block } from "./Block";
import { WikiSpace } from "./WikiSpace";

class Page extends HashedObject {
  static className = "hhs-wiki/v0/Page";

  wiki?: WikiSpace;
  name?: string;
  blocks?: CausalArray<Block>;
  titleBlock?: Block;

  constructor(name?: string, wiki?: WikiSpace) {
    super();

    if (name !== undefined && wiki !== undefined) {
      this.wiki = wiki;
      this.name = name;
      this.setId(
        Hashing.forString(this.wiki.hash() + "_" + this.name)
      );
      this.addDerivedField('blocks', new CausalArray<Block>({duplicates: false, writers: wiki.owners?.values(), mutableWriters: wiki.editors}));
      this.addDerivedField('titleBlock', new Block());
    }
  }

  setAuthor(author: Identity) {
    super.setAuthor(author);
    this.setId(
      Hashing.forString(this.wiki?.hash() + "_" + this.name)
    );
  }

  async addBlock(idx?: number, type?: BlockType) {

    const block = new Block(type);
    
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

  async removeBlock(block: Block) {
    this.blocks?.deleteElement(block);
    this.blocks?.save();
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
