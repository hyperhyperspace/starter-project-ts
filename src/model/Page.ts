import {
  ClassRegistry,
  HashedObject,
  Hashing,
  Identity,
  MutableArray,
} from "@hyper-hyper-space/core";
import { Block } from "./Block";
import { WikiSpace } from "./WikiSpace";

class Page extends HashedObject {
  static className = "hhs-wiki/v0/Page";

  wiki?: WikiSpace;
  name?: string;
  blocks?: MutableArray<Block>;

  constructor(name?: string, wiki?: WikiSpace, owner?: Identity) {
    super();

    if (name !== undefined && wiki !== undefined) {
      this.wiki = wiki;
      this.name = name;
      this.setId(
        Hashing.forString(this.wiki.hash() + "_" + this.name)
      );
      this.addDerivedField('blocks', new MutableArray<Block>())
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
