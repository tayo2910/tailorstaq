import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoadingSpinner from '../../src/components/common/LoadingSpinner.vue';

describe('LoadingSpinner', () => {
  it('does not render when visible is false', () => {
    const wrapper = mount(LoadingSpinner, { props: { visible: false } });
    expect(wrapper.find('div').exists()).toBe(false);
  });

  it('renders when visible is true', () => {
    const wrapper = mount(LoadingSpinner, { props: { visible: true } });
    expect(wrapper.find('div').exists()).toBe(true);
  });

  it('contains the spinning animation element', () => {
    const wrapper = mount(LoadingSpinner, { props: { visible: true } });
    const spinner = wrapper.find('.animate-spin');
    expect(spinner.exists()).toBe(true);
  });

  it('uses brand accent color class', () => {
    const wrapper = mount(LoadingSpinner, { props: { visible: true } });
    const spinner = wrapper.find('.animate-spin');
    expect(spinner.classes()).toContain('border-brand-accent');
  });

  it('transitions from hidden to visible', async () => {
    const wrapper = mount(LoadingSpinner, { props: { visible: false } });
    expect(wrapper.find('div').exists()).toBe(false);
    await wrapper.setProps({ visible: true });
    expect(wrapper.find('div').exists()).toBe(true);
  });

  it('transitions from visible to hidden', async () => {
    const wrapper = mount(LoadingSpinner, { props: { visible: true } });
    expect(wrapper.find('div').exists()).toBe(true);
    await wrapper.setProps({ visible: false });
    expect(wrapper.find('div').exists()).toBe(false);
  });
});
