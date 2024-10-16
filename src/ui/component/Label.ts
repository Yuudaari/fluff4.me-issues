import type { ComponentBrand } from "ui/Component"
import Component from "ui/Component"
import type Input from "ui/component/extension/Input"
import State from "utility/State"

interface LabelExtensions {
	for: State<string | undefined>
	setFor (inputName?: string): this
	setRequired (required?: boolean | State<boolean>): this
	setInput (input: Input): this
}

interface Label extends Component, LabelExtensions { }

const Label = Component.Builder("label", (label): Label => {
	label.style("label")

	let requiredState: State<boolean> | undefined
	return label
		.extend<LabelExtensions>(label => ({
			for: State(undefined),
			setFor: inputName => {
				label.attributes.set("for", inputName)
				label.for.value = inputName
				return label
			},
			setRequired: (required = true) => {
				label.style.unbind(requiredState)
				requiredState = undefined
				if (typeof required === "boolean")
					label.style.toggle("label-required")
				else
					label.style.bind(requiredState = required, "label-required")
				return label
			},
			setInput: input => {
				if (!label.is(AutoLabel))
					label.setFor(input.name.value)

				label.setRequired(input.required)
				return label
			},
		}))
})

export default Label


interface AutoLabelExtensions extends ComponentBrand<"autolabel"> {
}

export interface AutoLabel extends Label, AutoLabelExtensions { }

let globalI = 0
export const AutoLabel = Component.Builder("label", (component): AutoLabel => {
	const label = component.and(Label)

	const i = globalI++
	label.text.state.use(label, text => label.setFor(`${text.toString().toLowerCase().replace(/\W+/g, "-")}-${i}`))

	return label.extend<AutoLabelExtensions>(label => ({
	}))
})