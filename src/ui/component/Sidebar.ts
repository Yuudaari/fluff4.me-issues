import Component from "ui/Component"
import Store from "utility/Store"

declare module "utility/Store" {
	interface ILocalStorage {
		sidebar: boolean
	}
}

interface SidebarExtensions {
	toggle (): this
}

interface Sidebar extends Component, SidebarExtensions { }

const Sidebar = Component.Builder("aside", (sidebar): Sidebar => {
	sidebar.style("sidebar")

	updateSidebarVisibility()
	return sidebar.extend<SidebarExtensions>(sidebar => ({
		toggle: () => {
			Store.items.sidebar = !Store.items.sidebar
			updateSidebarVisibility()
			return sidebar
		},
	}))

	function updateSidebarVisibility () {
		sidebar.style.toggle(!!Store.items.sidebar, "sidebar--visible")
	}
})

export default Sidebar
