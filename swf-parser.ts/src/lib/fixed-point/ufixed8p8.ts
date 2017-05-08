import {Uint16} from "../integer-names";
import {FixedPoint} from "./fixed-point";
import {FixedPointType} from "./type";

/**
 * Unsigned Fixed-Point number with an 8-bit integer part and an 8-bit fractional part
 */
export class Ufixed8P8 extends FixedPoint {
  protected constructor(epsilons: number) {
    super(epsilons, Ufixed8P8.signed, Ufixed8P8.intBits, Ufixed8P8.fracBits);
  }

  static signed: boolean = false;
  static intBits: number = 8;
  static fracBits: number = 8;

  static fromEpsilons(epsilons: Uint16): Ufixed8P8 {
    return new Ufixed8P8(epsilons);
  }

  static fromValue(value: number): Ufixed8P8 {
    return new Ufixed8P8(value * Math.pow(2, Ufixed8P8.fracBits));
  }

  static type: FixedPointType<Ufixed8P8> = new FixedPointType<Ufixed8P8>({type: Ufixed8P8});
}
