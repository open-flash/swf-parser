import {Uint32} from "../integer-names";
import {FixedPoint} from "./fixed-point";
import {FixedPointType} from "./type";

/**
 * Unsigned Fixed-Point number with an 16-bit integer part and an 16-bit fractional part
 */
export class Ufixed16P16 extends FixedPoint {
  protected constructor(epsilons: number) {
    super(epsilons, Ufixed16P16.signed, Ufixed16P16.intBits, Ufixed16P16.fracBits);
  }

  static signed: boolean = false;
  static intBits: number = 16;
  static fracBits: number = 16;

  static fromEpsilons(epsilons: Uint32): Ufixed16P16 {
    return new Ufixed16P16(epsilons);
  }

  static fromValue(value: number): Ufixed16P16 {
    return new Ufixed16P16(value * Math.pow(2, Ufixed16P16.fracBits));
  }

  static type: FixedPointType<Ufixed16P16> = new FixedPointType<Ufixed16P16>({type: Ufixed16P16});
}
