import type Component from "ui/Component"
import Mouse from "ui/utility/Mouse"
import Viewport from "ui/utility/Viewport"
import type { PartialRecord } from "utility/Type"

////////////////////////////////////
//#region Anchor Strings

export const ANCHOR_TYPES = ["off", "aligned"] as const
export type AnchorType = (typeof ANCHOR_TYPES)[number]

export const ANCHOR_SIDE_HORIZONTAL = ["left", "right"] as const
export type AnchorSideHorizontal = (typeof ANCHOR_SIDE_HORIZONTAL)[number]

export const ANCHOR_SIDE_VERTICAL = ["top", "bottom"] as const
export type AnchorSideVertical = (typeof ANCHOR_SIDE_VERTICAL)[number]

export type AnchorOffset = `+${number}` | `-${number}`
export type AnchorStringHorizontalSimple = `${AnchorType} ${AnchorSideHorizontal}` | "centre"
export type AnchorStringHorizontal = `${"sticky " | ""}${AnchorStringHorizontalSimple}${"" | ` ${AnchorOffset}`}`
export type AnchorStringVerticalSimple = `${AnchorType} ${AnchorSideVertical}` | "centre"
export type AnchorStringVertical = `${"sticky " | ""}${AnchorStringVerticalSimple}${"" | ` ${AnchorOffset}`}`
export type AnchorStringSimple = AnchorStringHorizontalSimple | AnchorStringVerticalSimple
export type AnchorString = AnchorStringHorizontal | AnchorStringVertical

const anchorStrings = new Set<AnchorString>(ANCHOR_TYPES
	.flatMap(type => [ANCHOR_SIDE_HORIZONTAL, ANCHOR_SIDE_VERTICAL]
		.flatMap(sides => sides
			.map(side => `${type} ${side}` as const)))
	.flatMap(type => [type, `sticky ${type}` as const]))

anchorStrings.add("centre")
anchorStrings.add("sticky centre")

function isAnchorString (value: unknown): value is AnchorString {
	if (anchorStrings.has(value as AnchorString)) {
		return true
	}

	if (typeof value !== "string") {
		return false
	}

	const lastSpace = value.lastIndexOf(" ")
	if (lastSpace === -1) {
		return false
	}

	const simpleAnchorString = value.slice(0, lastSpace)
	if (!anchorStrings.has(simpleAnchorString as AnchorString)) {
		return false
	}

	const offsetString = value.slice(lastSpace + 1)
	return !isNaN(+offsetString)
}

function parseAnchor (anchor: AnchorStringHorizontal): AnchorLocationHorizontal
function parseAnchor (anchor: AnchorStringVertical): AnchorLocationVertical
function parseAnchor (anchor: AnchorString): AnchorLocationHorizontal | AnchorLocationVertical {
	const sticky = anchor.startsWith("sticky")
	if (sticky) {
		anchor = anchor.slice(7) as AnchorStringSimple
	}

	const simpleAnchor = anchor as AnchorStringSimple
	if (simpleAnchor === "centre") {
		return { sticky, type: "centre", side: "centre", offset: 0 }
	}

	const [type, side, offset] = simpleAnchor.split(" ") as [AnchorType, AnchorSideHorizontal | AnchorSideVertical, AnchorOffset?]
	return {
		sticky,
		type,
		side,
		offset: offset ? +offset : 0,
	}
}

//#endregion
////////////////////////////////////

////////////////////////////////////
//#region Anchor Location

export interface AnchorLocationPreference {
	xAnchor: AnchorLocationHorizontal
	xRefSelector: string
	yAnchor: AnchorLocationVertical
	yRefSelector: string
}

export interface AnchorLocationHorizontal {
	type: AnchorType | "centre"
	side: AnchorSideHorizontal | "centre"
	sticky: boolean
	offset: number
}

export interface AnchorLocationVertical {
	type: AnchorType | "centre"
	side: AnchorSideVertical | "centre"
	sticky: boolean
	offset: number
}

export const ANCHOR_LOCATION_ALIGNMENTS = ["left", "centre", "right"] as const
export type AnchorLocationAlignment = (typeof ANCHOR_LOCATION_ALIGNMENTS)[number]

export interface AnchorLocation {
	x: number
	y: number
	mouse: boolean
	padX: boolean
	alignment?: AnchorLocationAlignment
}

//#endregion
////////////////////////////////////

////////////////////////////////////
//#region Implementation

interface AnchorManipulator<HOST> {
	isMouse (): boolean
	reset (): HOST
	from (component: Component): HOST
	/**
	 * Add a location fallback by defining an x and y anchor on the source component.
	 */
	add (xAnchor: AnchorStringHorizontal, yAnchor: AnchorStringVertical): HOST
	/**
	 * Add a location fallback by defining an x anchor on a selected ancestor component, and a y anchor on the source component.
	 */
	add (xAnchor: AnchorStringHorizontal, xRefSelector: string, yAnchor: AnchorStringVertical): HOST
	/**
	 * Add a location fallback by defining an x anchor on the source component, and a y anchor on a selected ancestor component.
	 */
	add (xAnchor: AnchorStringHorizontal, yAnchor: AnchorStringVertical, yRefSelector: string): HOST
	/**
	 * Add a location fallback by defining x and y anchors on selected ancestor components.
	 */
	add (xAnchor: AnchorStringHorizontal, xRefSelector: string, yAnchor: AnchorStringVertical, yRefSelector: string): HOST

	/**
	 * Marks the anchor positioning "dirty", causing it to be recalculated from scratch on next poll
	 */
	markDirty (): HOST
	get (): AnchorLocation
	apply (): HOST
}

function AnchorManipulator<HOST extends Component> (host: HOST): AnchorManipulator<HOST> {
	let locationPreference: AnchorLocationPreference[] | undefined
	let refCache: PartialRecord<string, WeakRef<Component>> | undefined
	let location: AnchorLocation | undefined
	let currentAlignment: AnchorLocationAlignment | undefined

	let from: Component | undefined
	function onFromRemove () {
		from = undefined
	}

	const result: AnchorManipulator<HOST> = {
		isMouse: () => !locationPreference?.length,
		from: component => {
			from?.event.unsubscribe("remove", onFromRemove)
			from = component
			component.event.subscribe("remove", onFromRemove)
			return host
		},
		reset: () => {
			locationPreference = undefined
			result.markDirty()
			return host
		},
		add: (...config: string[]) => {
			let [xAnchor, xRefSelector, yAnchor, yRefSelector] = config
			if (isAnchorString(xRefSelector)) {
				yRefSelector = yAnchor
				yAnchor = xRefSelector
				xRefSelector = "*"
			}

			yRefSelector ??= "*"

			locationPreference ??= []
			locationPreference.push({
				xAnchor: parseAnchor(xAnchor as AnchorStringHorizontal),
				xRefSelector,
				yAnchor: parseAnchor(yAnchor as AnchorStringVertical),
				yRefSelector,
			})

			result.markDirty()
			return host
		},
		markDirty: () => {
			return host
		},
		get: () => {
			if (location) {
				return location
			}

			const tooltipBox = host?.rect.value
			if (tooltipBox && locationPreference && from) {
				for (const preference of locationPreference) {
					let alignment: AnchorLocationAlignment = "left"

					const xConf = preference.xAnchor
					const xRef = resolveAnchorRef(preference.xRefSelector)
					const xBox = xRef?.rect.value
					const xCenter = (xBox?.left ?? 0) + (xBox?.width ?? Viewport.size.value.w) / 2
					const xRefX = (xConf.side === "right" ? xBox?.right : xConf.side === "left" ? xBox?.left : xCenter) ?? xCenter
					let x: number
					switch (xConf.type) {
						case "aligned":
							x = xConf.side === "right" ? xRefX - tooltipBox.width - xConf.offset : xRefX + xConf.offset
							alignment = xConf.side
							break
						case "off":
							x = xConf.side === "right" ? xRefX + xConf.offset : xRefX - tooltipBox.width - xConf.offset
							// alignment is inverted side for "off"
							alignment = xConf.side === "left" ? "right" : "left"
							break
						case "centre":
							x = xRefX - tooltipBox.width / 2
							alignment = "centre"
							break
					}

					if (!xConf.sticky && tooltipBox.width < Viewport.size.value.w) {
						const isXOffScreen = x - (alignment === "right" ? tooltipBox.width : 0) < 0
							|| x + (alignment === "right" ? 0 : tooltipBox.width - 10) > Viewport.size.value.w
						if (isXOffScreen) {
							continue
						}
					}

					const yConf = preference.yAnchor
					const yRef = resolveAnchorRef(preference.yRefSelector)
					const yBox = yRef?.rect.value
					const yCenter = (yBox?.top ?? 0) + (yBox?.height ?? Viewport.size.value.h) / 2
					const yRefY = (yConf.side === "bottom" ? yBox?.bottom : yConf.side === "top" ? yBox?.top : yCenter) ?? yCenter
					let y: number
					switch (yConf.type) {
						case "aligned":
							y = yConf.side === "bottom" ? yRefY - tooltipBox.height - yConf.offset : yRefY + yConf.offset
							break
						case "off":
							y = yConf.side === "bottom" ? yRefY + yConf.offset : yRefY - tooltipBox.height - yConf.offset
							break
						case "centre":
							y = yRefY - tooltipBox.height / 2
							break
					}

					if (!yConf.sticky && tooltipBox.height < Viewport.size.value.h) {
						const isYOffScreen = y < 0
							|| y + tooltipBox.height > Viewport.size.value.h
						if (isYOffScreen) {
							continue
						}
					}

					return location ??= { mouse: false, padX: xConf.type === "off", alignment, x, y }
				}
			}

			return location ??= { mouse: true, padX: true, ...Mouse.state.value }
		},
		apply: () => {
			const location = result.get()
			let alignment = location.alignment ?? currentAlignment
			if (location.mouse) {
				const shouldFlip = currentAlignment === "centre" || (currentAlignment === "right" ? location.x < Viewport.size.value.w / 2 - 200 : location.x > Viewport.size.value.w / 2 + 200)
				if (shouldFlip) {
					alignment = currentAlignment === "left" ? "right" : "left"
				}
			}

			if (currentAlignment !== alignment) {
				currentAlignment = alignment
				// this.surface.classes.removeStartingWith("aligned-")
				// this.surface.classes.add(`aligned-${this.currentAlignment}`)
			}

			// this.surface.classes.toggle(location.padX, "pad-x")
			host.element.style.left = `${location.x}px`
			host.element.style.top = `${location.y}px`
			host.rect.markDirty()

			return host
		},
	}

	return result


	function resolveAnchorRef (selector: string): Component | undefined {
		const refRef = refCache?.[selector]

		let ref: Component | undefined
		if (refRef) {
			ref = refRef.deref()

		} else {
			ref = from?.element.closest(selector)?.component
			if (ref) {
				refCache ??= {}
				refCache[selector] = new WeakRef(ref)
			}
		}

		return ref
	}
}

export default AnchorManipulator

//#endregion
////////////////////////////////////