export class FixedPoint extends Number {
  public epsilons: number;
  protected signed: boolean;
  protected intBits: number;
  protected fracBits: number;

  constructor(epsilons: number, signed: boolean, intBits: number, fracBits: number) {
    super(epsilons * Math.pow(2, -fracBits));
    this.epsilons = epsilons;
    this.signed = signed;
    this.intBits = intBits;
    this.fracBits = fracBits;
  }

  toJSON(): number {
    return this.valueOf();
  }
}

export interface FixedPointConstructor<T extends FixedPoint> {
  readonly signed: boolean;
  readonly intBits: number;
  readonly fracBits: number;
  fromEpsilons(epsilons: number): T;
  fromValue(value: number): T;
}
