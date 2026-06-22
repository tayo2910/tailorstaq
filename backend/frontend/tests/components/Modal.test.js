import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Modal from '../../src/components/common/Modal.vue';

describe('Modal', () => {
  it('does not render when visible is false', () => {
    const wrapper = mount(Modal, { props: { visible: false } });
    expect(wrapper.find('.fixed').exists()).toBe(false);
  });

  it('renders when visible is true', () => {
    const wrapper = mount(Modal, { props: { visible: true } });
    expect(wrapper.find('.fixed').exists()).toBe(true);
  });

  it('renders slot content when visible', () => {
    const wrapper = mount(Modal, {
      props: { visible: true },
      slots: { default: '<p class="slot-content">Modal Content</p>' },
    });
    expect(wrapper.find('.slot-content').exists()).toBe(true);
    expect(wrapper.text()).toContain('Modal Content');
  });

  it('emits close event when backdrop is clicked', () => {
    const wrapper = mount(Modal, { props: { visible: true } });
    wrapper.find('.fixed').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('does not emit close when inner content is clicked', () => {
    const wrapper = mount(Modal, {
      props: { visible: true },
      slots: { default: '<div class="inner">Content</div>' },
    });
    wrapper.find('.bg-white').trigger('click');
    expect(wrapper.emitted('close')).toBeFalsy();
  });

  it('has the correct max-width class', () => {
    const wrapper = mount(Modal, { props: { visible: true } });
    const inner = wrapper.find('.bg-white');
    expect(inner.classes()).toContain('max-w-md');
    expect(inner.classes()).toContain('w-full');
  });

  it('transitions from hidden to visible', async () => {
    const wrapper = mount(Modal, { props: { visible: false } });
    expect(wrapper.find('.fixed').exists()).toBe(false);
    await wrapper.setProps({ visible: true });
    expect(wrapper.find('.fixed').exists()).toBe(true);
  });
});
