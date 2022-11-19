import {
  ClassRegistry,
  HashedObject,
  Hashing,
  Identity,
} from "@hyper-hyper-space/core";

import { BlockType } from "..";
import { PageBlockArray } from "./PageBlockArray";
import { Block } from "./Block";
import { WikiSpace } from "./WikiSpace";

class Page extends HashedObject {
  static className = "hhs-wiki/v0/Page";

  wiki?: WikiSpace;
  name?: string;
  blocks?: PageBlockArray;
  titleBlock?: Block;

  constructor(name?: string, wiki?: WikiSpace) {
    super();

    if (name !== undefined && wiki !== undefined) {
      this.wiki = wiki;
      this.name = name;
      this.setId(
        Hashing.forString(this.wiki.hash() + "_" + this.name)
      );
      this.addDerivedField('blocks', new PageBlockArray(wiki.owners?.values(), wiki.members, wiki.writeConfig));
      this.addDerivedField('titleBlock', new Block());
    }
  }

  setAuthor(author: Identity) {
    super.setAuthor(author);
    this.setId(
      Hashing.forString(this.wiki?.hash() + "_" + this.name)
    );
  }

  async addBlock(idx?: number, type?: BlockType, author?: Identity) {

    const block = new Block(type, author);
    
    if (this.hasResources()) {
      block.setResources(this.getResources()!);
    }

    if (idx === undefined) {
      await this.blocks?.push(block, author);
    } else {
      await this.blocks?.insertAt(block, idx, author);
    }
    
    await this.blocks?.saveQueuedOps();
    
    if (!this.wiki?.hasPage(this.name as string)) {
      await this.wiki?.pages?.add(this, author);
      await this.wiki?.pages?.save();  
    }

    return block;
  }
  
  async moveBlock(from: number, to: number, author?: Identity) {
    console.log('moving block from', from, 'to', to)
    const block = this.blocks?.valueAt(from);
    if (block) {
        //await this.blocks?.deleteAt(from); // shouldn't need this - I think we don't!
        await this.blocks?.insertAt(block, to, author);
        await this.blocks?.save();
        return to
    } else {
      return from
    }
  }

  async removeBlock(block: Block, author?: Identity) {
    this.blocks?.deleteElement(block, author);
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
