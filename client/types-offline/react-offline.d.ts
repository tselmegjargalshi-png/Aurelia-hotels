/**
 * OFFLINE TYPE SHIM — used only by `npm run typecheck:offline`.
 *
 * The build environment for this project had no npm registry access, so
 * @types/react could not be installed. This minimal declaration lets tsc check
 * the client's own logic (hooks, props, data flow, shared imports). Intrinsic
 * JSX element attributes are NOT checked here. After `npm install`, use
 * `npm run typecheck`, which uses the real @types/react and ignores this file.
 */
declare module 'react' {
  export type ReactNode = ReactElement | string | number | bigint | boolean | null | undefined | Iterable<ReactNode>;
  export interface ReactElement { type: unknown; props: unknown; key: string | null }
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export interface RefObject<T> { current: T }
  export interface Context<T> { Provider: (props: { value: T; children?: ReactNode }) => ReactElement; _t?: T }
  export type DependencyList = readonly unknown[];

  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), deps?: DependencyList): void;
  export function useMemo<T>(factory: () => T, deps: DependencyList): T;
  export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: DependencyList): T;
  export function useRef<T>(initial: T): RefObject<T>;
  export function useRef<T>(initial: T | null): RefObject<T | null>;
  export function useContext<T>(ctx: Context<T>): T;
  export function createContext<T>(defaultValue: T): Context<T>;
  export function useId(): string;
  export const StrictMode: (props: { children?: ReactNode }) => ReactElement;

  interface SyntheticEvent<T = Element> { currentTarget: T; target: EventTarget & T; preventDefault(): void; stopPropagation(): void; defaultPrevented: boolean }
  export interface MouseEvent<T = Element> extends SyntheticEvent<T> { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; clientX: number }
  export type FormEvent<T = Element> = SyntheticEvent<T>;

  // Attribute bags are deliberately loose in the shim.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyEl = any;
  export interface UIEvent extends SyntheticEvent<AnyEl> { key: string; shiftKey: boolean; clientX: number; button: number; metaKey: boolean; ctrlKey: boolean; altKey: boolean }
  export interface Handlers {
    onChange?: (e: UIEvent) => void; onClick?: (e: UIEvent) => void; onSubmit?: (e: UIEvent) => void; onBlur?: (e: UIEvent) => void;
    onKeyDown?: (e: UIEvent) => void; onMouseDown?: (e: UIEvent) => void; onPointerDown?: (e: UIEvent) => void; onPointerUp?: (e: UIEvent) => void;
  }
  type Loose = Handlers & { [attr: string]: AnyEl };
  export type HTMLAttributes<_T = Element> = Loose & { id?: string; className?: string; children?: ReactNode };
  export type AnchorHTMLAttributes<T = Element> = HTMLAttributes<T> & { target?: string; onClick?: (e: MouseEvent<T>) => void };
  export type InputHTMLAttributes<T = Element> = HTMLAttributes<T>;
  export type SelectHTMLAttributes<T = Element> = HTMLAttributes<T>;
  export type TextareaHTMLAttributes<T = Element> = HTMLAttributes<T>;
}

declare module 'react/jsx-runtime' {
  export const jsx: unknown;
  export const jsxs: unknown;
  export const Fragment: unknown;
}

declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export function createRoot(el: Element): { render(node: ReactNode): void; unmount(): void };
}

declare namespace JSX {
  type Element = import('react').ReactElement;
  interface ElementChildrenAttribute { children: object }
  interface IntrinsicAttributes { key?: string | number | null }
  interface IntrinsicElements { [tag: string]: import('react').HTMLAttributes }
}

declare module '*.css';
