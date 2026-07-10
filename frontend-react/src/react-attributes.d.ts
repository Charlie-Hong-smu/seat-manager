import "react";

declare module "react" {
  interface HTMLAttributes<T> {
    /** Standard HTML inert attribute; supported by current target browsers. */
    inert?: boolean;
  }
}
