<script>
	import * as item from '../../platform/item'
	import Navbar from '../../platform/components/Navbar.svelte'
	import Item from '../../platform/components/Item.svelte'
	
	export let router
	export let items

	const store = items.$
</script>

<Navbar>
	<div>Todo Items</div>
	<div
		on:click={() => router.navigate('/add')}>
		Add New +
	</div>
</Navbar>

<main>
{#each $store as item}
	<Item title={item.title} />
{/each}
</main>
