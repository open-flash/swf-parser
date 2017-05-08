import {Int16} from "../integer-names";
import {FixedPoint} from "./fixed-point";
import {FixedPointType} from "./type";

/**
 * Signed Fixed-Point number with an 8-bit integer part and an 8-bit fractional part
 */
export class Fixed8P8 extends FixedPoint {
  protected constructor(epsilons: number) {
    super(epsilons, Fixed8P8.signed, Fixed8P8.intBits, Fixed8P8.fracBits);
  }

  static signed: boolean = true;
  static intBits: number = 8;
  static fracBits: number = 8;

  static fromEpsilons(epsilons: Int16): Fixed8P8 {
    return new Fixed8P8(epsilons);
  }

  static fromValue(value: number): Fixed8P8 {
    return new Fixed8P8(value * Math.pow(2, Fixed8P8.fracBits));
  }

  static type: FixedPointType<Fixed8P8> = new FixedPointType<Fixed8P8>({type: Fixed8P8});
}
