import type { TagId } from "model/Tags"
import Tags from "model/Tags"
import Component from "ui/Component"
import type { InputExtensions } from "ui/component/core/ext/Input"
import Input from "ui/component/core/ext/Input"
import Slot from "ui/component/core/Slot"
import TextInput from "ui/component/core/TextInput"
import Tag from "ui/component/Tag"
import Applicator from "ui/utility/Applicator"
import AbortPromise from "utility/AbortPromise"
import State from "utility/State"
import Strings from "utility/string/Strings"

export interface TagsState {
	global_tags: TagId[]
	custom_tags: string[]
}

interface TagsEditorExtensions {
	readonly state: State<TagsState>
	readonly default: Applicator.Optional<this, Partial<TagsState>>
}

interface TagsEditor extends Component, TagsEditorExtensions, InputExtensions { }

const TagsEditor = Component.Builder((component): TagsEditor => {
	const tagsState = State<TagsState>({ global_tags: [], custom_tags: [] })

	const tagsContainer = Slot()
		.style("tags-editor-added")
		.use(tagsState, AbortPromise.asyncFunction(async (signal, slot, tags) => {
			const globalTags = await Tags.resolve(tags.global_tags)
			if (signal.aborted)
				return

			if (globalTags.length)
				Component()
					.style("tags-editor-added-type", "tags-editor-added-global")
					.append(...globalTags.map(Tag))
					.appendTo(slot)

			if (tags.custom_tags.length)
				Component()
					.style("tags-editor-added-type", "tags-editor-added-custom")
					.append(...tags.custom_tags.map(Tag))
					.appendTo(slot)
		}))

	const input = TextInput()
		.style("tags-editor-input")
		.placeholder.use("shared/form/tags/placeholder")

	const tagSuggestions = Slot()
		.style("tags-editor-suggestions")
		.use(State.UseManual({ tags: tagsState, input: input.state }), AbortPromise.asyncFunction(async (signal, slot, { tags, input }) => {
			const manifest = await Tags.getManifest()
			if (signal.aborted)
				return

			let [category, name] = Strings.splitOnce(input, ":")
			if (name === undefined)
				name = category, category = ""

			category = category.trim(), name = name.trim()

			const categorySuggestions = category ? []
				: Object.values(manifest.categories)
					.filter(category => category.nameLowercase.startsWith(name))
					.sort(
						category => -Object.values(manifest.tags).filter(tag => tag.category === category.name).length,
						(a, b) => a.name.localeCompare(b.name),
					)
					.map(category => Tag({ category: category.name, name: "...", description: { body: category.description } }))

			if (categorySuggestions.length)
				Component()
					.style("tags-editor-suggestions-type")
					.append(...categorySuggestions)
					.appendTo(slot)

			const tagSuggestions = category
				? Object.values(manifest.tags)
					.filter(tag => tag.categoryLowercase.startsWith(category) && tag.nameLowercase.startsWith(name))
				: name
					? Object.values(manifest.tags)
						.filter(tag => tag.wordsLowercase.some(word => word.startsWith(name)))
					: []

			if (tagSuggestions.length)
				Component()
					.style("tags-editor-suggestions-type")
					.append(...tagSuggestions.map(Tag))
					.appendTo(slot)

			if (!category && name)
				Component()
					.style("tags-editor-suggestions-type")
					.append(Component()
						.style("tags-editor-suggestions-type-label")
						.text.use("shared/form/tags/suggestion/add-as-custom"))
					.append(Tag(name))
					.appendTo(slot)
		}))

	const editor: TagsEditor = component
		.and(Input)
		.style("tags-editor")
		.append(tagsContainer)
		.append(input)
		.append(tagSuggestions)
		.extend<TagsEditorExtensions>(editor => ({
			state: tagsState,
			get tags () {
				return tagsState.value
			},
			default: Applicator(editor, value => tagsState.value = {
				global_tags: value?.global_tags?.slice() ?? [],
				custom_tags: value?.custom_tags?.slice() ?? [],
			}),
		}))

	input.event.subscribe("keydown", event => {
		if (event.key === "Enter" && input.value.trim()) {
			event.preventDefault()
		}
	})

	editor.length.value = 0
	return editor
})

export default TagsEditor
