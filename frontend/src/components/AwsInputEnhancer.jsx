import {useEffect} from "react"

const INPUT_SELECTOR = [
  "input:not([type])",
  'input[type="date"]',
  'input[type="email"]',
  'input[type="number"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="tel"]',
  'input[type="text"]',
  'input[type="time"]',
].join(",")

function setInputValue(input, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value")?.set
    || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set

  if (valueSetter) {
    valueSetter.call(input, value)
  } else {
    input.value = value
  }

  input.dispatchEvent(new Event("input", {bubbles: true}))
  input.dispatchEvent(new Event("change", {bubbles: true}))
}

function isEligibleInput(input) {
  return input instanceof HTMLInputElement
    && !input.disabled
    && !input.readOnly
    && !input.classList.contains("medstream-choice-input")
    && !input.closest("[data-aws-input-clear-ignore]")
    && !input.closest(".medstream-clearable-field")
}

export default function AwsInputEnhancer() {
  useEffect(() => {
    const layer = document.createElement("div")
    const buttonByInput = new Map()

    layer.className = "medstream-input-clear-layer"
    document.body.appendChild(layer)

    const hideButton = (input) => {
      const button = buttonByInput.get(input)
      if (button) {
        button.hidden = true
      }
    }

    const updateButton = (input) => {
      if (!isEligibleInput(input) || !input.isConnected) {
        hideButton(input)
        return
      }

      const rect = input.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        hideButton(input)
        return
      }

      let button = buttonByInput.get(input)
      if (!button) {
        button = document.createElement("button")
        button.type = "button"
        button.className = "medstream-global-clear-button"
        button.setAttribute("aria-label", "Clear field")
        button.addEventListener("mousedown", (event) => event.preventDefault())
        button.addEventListener("click", () => {
          if (!input.value) {
            return
          }

          setInputValue(input, "")
          input.focus()
          updateButton(input)
        })
        layer.appendChild(button)
        buttonByInput.set(input, button)
      }

      button.disabled = !input.value
      button.hidden = false
      button.style.left = `${window.scrollX + rect.right - 30}px`
      button.style.top = `${window.scrollY + rect.top + (rect.height - 22) / 2}px`
    }

    const syncInputs = () => {
      const inputs = Array.from(document.querySelectorAll(INPUT_SELECTOR))
      const currentInputs = new Set(inputs)

      inputs.forEach(updateButton)

      buttonByInput.forEach((button, input) => {
        if (!currentInputs.has(input) || !input.isConnected || !isEligibleInput(input)) {
          button.remove()
          buttonByInput.delete(input)
        }
      })
    }

    const handleInputEvent = (event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches(INPUT_SELECTOR)) {
        updateButton(event.target)
      }
    }

    const observer = new MutationObserver((mutations) => {
      const onlyEnhancerChanged = mutations.every((mutation) => {
        return mutation.target instanceof Node && layer.contains(mutation.target)
      })

      if (!onlyEnhancerChanged) {
        syncInputs()
      }
    })

    observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["class", "disabled", "readonly", "style", "value"]})
    document.addEventListener("input", handleInputEvent, true)
    document.addEventListener("change", handleInputEvent, true)
    document.addEventListener("focusin", handleInputEvent, true)
    document.addEventListener("keyup", handleInputEvent, true)
    window.addEventListener("resize", syncInputs)
    window.addEventListener("scroll", syncInputs, true)

    syncInputs()

    return () => {
      observer.disconnect()
      document.removeEventListener("input", handleInputEvent, true)
      document.removeEventListener("change", handleInputEvent, true)
      document.removeEventListener("focusin", handleInputEvent, true)
      document.removeEventListener("keyup", handleInputEvent, true)
      window.removeEventListener("resize", syncInputs)
      window.removeEventListener("scroll", syncInputs, true)
      layer.remove()
    }
  }, [])

  return null
}
