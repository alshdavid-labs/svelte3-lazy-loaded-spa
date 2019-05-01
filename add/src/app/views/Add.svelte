<script>
	import * as item from '../platform/item' 
	import Navbar from '../platform/components/Navbar.svelte'
	
	export let router
	export let items

	let title = ''

	const add = () => {
		items.add(item.create(title))
		router.navigate('/home')
	}
</script>

<Navbar>
	<div>Add Item</div>
	<div
		on:click={() => router.navigate('/home')}>
		Cancel
	</div>
</Navbar>

<main>
	<input 
		bind:value={title}
		type="text" 
		placeholder="title" />
	<button
		on:click={add}>
		Add
	</button>
</main>