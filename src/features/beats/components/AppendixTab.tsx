import React from 'react';
import { BookOpen } from 'lucide-react';
import { appendixData } from '../constants';

export function AppendixTab() {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#0f0f0f] rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-6 border-b border-white/10 bg-[#141414]">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-indigo-400" />
                        Indicator Appendix
                    </h2>
                    <p className="text-sm text-white/50 mt-1">Detailed definitions of the macro and factor-based lead indicators</p>
                </div>
                <div className="p-0">
                    <div className="divide-y divide-white/5">
                        {appendixData.map((item, idx) => (
                            <div key={idx} className="p-6 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row gap-4 md:gap-8">
                                <div className="md:w-1/3 shrink-0">
                                    <h3 className="text-base font-medium text-white">{item.name}</h3>
                                    <div className="text-xs font-mono text-white/40 mt-1 tracking-wider uppercase">ID: {item.id}</div>
                                </div>
                                <div className="md:w-2/3">
                                    <p className="text-sm text-white/60 leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
