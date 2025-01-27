import NotificationList from 'ui/component/NotificationList'
import View from 'ui/view/shared/component/View'
import ViewDefinition from 'ui/view/shared/component/ViewDefinition'

export default ViewDefinition({
	create: async () => {
		const view = View('notifications')

		const list = await NotificationList()
		list.appendTo(view.content)

		return view
	},
})
