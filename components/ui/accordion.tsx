"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";

const Accordion = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { type?: "single" | "multiple"; collapsible?: boolean; defaultValue?: string | string[] }
>(({ className, type = "single", collapsible = false, defaultValue, children, ...props }, ref) => {
    // Basic state management for simplicity since we don't have Radix installed properly
    const [value, setValue] = React.useState<string | string[]>(defaultValue || (type === "multiple" ? [] : ""));

    const handleValueChange = (itemValue: string) => {
        if (type === "single") {
            setValue(value === itemValue ? (collapsible ? "" : itemValue) : itemValue);
        } else {
            const arrayValue = value as string[];
            if (arrayValue.includes(itemValue)) {
                setValue(arrayValue.filter((v) => v !== itemValue));
            } else {
                setValue([...arrayValue, itemValue]);
            }
        }
    };

    return (
        <div ref={ref} className={cn("space-y-1", className)} {...props}>
            {React.Children.map(children, (child) => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child, {
                        // @ts-ignore
                        accordionValue: value,
                        // @ts-ignore
                        onValueChange: handleValueChange,
                    });
                }
                return child;
            })}
        </div>
    );
});
Accordion.displayName = "Accordion";

const AccordionItem = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, children, ...props }, ref) => {
    // @ts-ignore
    const { accordionValue, onValueChange } = props;
    const isOpen = Array.isArray(accordionValue) ? accordionValue.includes(value) : accordionValue === value;

    return (
        <div ref={ref} className={cn("border-b", className)}>
            {React.Children.map(children, (child) => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child, {
                        // @ts-ignore
                        isOpen,
                        // @ts-ignore
                        onToggle: () => onValueChange && onValueChange(value)
                    });
                }
                return child;
            })}
        </div>
    );
});
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
    // @ts-ignore
    const { isOpen, onToggle } = props;

    return (
        <div className="flex">
            <button
                ref={ref}
                onClick={onToggle}
                className={cn(
                    "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
                    className
                )}
                data-state={isOpen ? "open" : "closed"}
                {...props}
            >
                {children}
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
            </button>
        </div>
    );
});
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
    // @ts-ignore
    const { isOpen } = props;

    return (
        <AnimatePresence initial={false}>
            {isOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                >
                    <div ref={ref} className={cn("pb-4 pt-0", className)} {...props}>
                        {children}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
