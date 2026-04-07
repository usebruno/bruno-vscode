import { IconChevronDown } from '@tabler/icons';
import Dropdown from 'components/Dropdown/index';
import {
  IconGrpcBidiStreaming,
  IconGrpcClientStreaming,
  IconGrpcServerStreaming,
  IconGrpcUnary
} from 'components/Icons/Grpc';
import SearchInput from 'components/SearchInput/index';
import { search } from 'fast-fuzzy';
import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { useTheme } from 'providers/Theme';
import StyledWrapper from './StyledWrapper';

interface GrpcMethod {
  path: string;
  type: 'unary' | 'client-streaming' | 'server-streaming' | 'bidi-streaming';
  serviceName?: string;
  methodName?: string;
}

interface MethodDropdownProps {
  grpcMethods: GrpcMethod[];
  selectedGrpcMethod: GrpcMethod | null;
  onMethodSelect?: (method: { path: string; type: string }) => void;
  onMethodDropdownCreate?: (ref: any) => void;
}


const MethodDropdown = ({
  grpcMethods,
  selectedGrpcMethod,
  onMethodSelect,
  onMethodDropdownCreate
}: MethodDropdownProps) => {
  const { theme } = useTheme();
  const [searchText, setSearchText] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeItem = listRef.current?.querySelector(`[data-index="${focusedIndex}"]`);
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  const groupMethodsByService = (methods: GrpcMethod[]) => {
    if (!methods || !methods.length) return {};

    const groupedMethods: Record<string, GrpcMethod[]> = {};

    methods.forEach((method: GrpcMethod) => {
      const pathWithoutLeadingSlash = method.path.startsWith('/') ? method.path.slice(1) : method.path;
      const parts = pathWithoutLeadingSlash.split('/');
      const serviceName = parts[0] || 'Default';
      const methodName = parts[1] || method.path;

      const enhancedMethod = {
        ...method,
        serviceName,
        methodName
      };

      if (!groupedMethods[serviceName]) {
        groupedMethods[serviceName] = [];
      }

      groupedMethods[serviceName].push(enhancedMethod);
    });

    return groupedMethods;
  };

  const getIconForMethodType = (type: string) => {
    switch (type) {
      case 'unary':
        return <IconGrpcUnary size={20} strokeWidth={2} color={theme.request.methods.get} />;
      case 'client-streaming':
        return <IconGrpcClientStreaming size={20} strokeWidth={2} color={theme.request.methods.post} />;
      case 'server-streaming':
        return <IconGrpcServerStreaming size={20} strokeWidth={2} color={theme.request.methods.put} />;
      case 'bidi-streaming':
        return <IconGrpcBidiStreaming size={20} strokeWidth={2} color={theme.colors.text.purple} />;
      default:
        return <IconGrpcUnary size={20} strokeWidth={2} color={theme.request.methods.get} />;
    }
  };

  const MethodsDropdownIcon = forwardRef<HTMLDivElement>((props, ref) => {
    return (
      <div ref={ref} className="method-dropdown-trigger" data-testid="grpc-method-dropdown-trigger">
        {selectedGrpcMethod && <div className="method-dropdown-trigger-icon">{getIconForMethodType(selectedGrpcMethod.type)}</div>}
        <span className="method-dropdown-trigger-text" data-testid="selected-grpc-method-name">
          {selectedGrpcMethod ? (selectedGrpcMethod.path.split('.').at(-1) || selectedGrpcMethod.path) : 'Select Method'}
        </span>
        <IconChevronDown className="method-dropdown-caret" size={14} strokeWidth={2} />
      </div>
    );
  });

  const handleGrpcMethodSelect = (method: GrpcMethod) => {
    const methodType = method.type;
    onMethodSelect?.({ path: method.path, type: methodType });
  };

  const filteredMethods = searchText ? search(String(searchText), grpcMethods, { keySelector: (obj: GrpcMethod) => obj.path }) as GrpcMethod[] : grpcMethods;

  const groupedMethods = groupMethodsByService(filteredMethods);

  // Flatten grouped methods for keyboard navigation
  const flatMethodList = Object.values(groupedMethods).flat();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!flatMethodList.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) =>
        prev < flatMethodList.length - 1 ? prev + 1 : flatMethodList.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) =>
        prev >= 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      handleGrpcMethodSelect(flatMethodList[focusedIndex]);
    }
  };

  const focusSearchInput = () => {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0); // 0ms to ensure the dropdown is fully rendered and focused
  };

  const handleDropdownShow = () => {
    focusSearchInput();
    setSearchText('');
    setFocusedIndex(-1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // auto focus the first method when the search input is not empty
    if (e.target.value.trim().length > 0) {
      setFocusedIndex(0);
    } else {
      setFocusedIndex(-1);
    }
  };

  if (!grpcMethods || grpcMethods.length === 0) {
    return null;
  }

  return (
    <StyledWrapper>
      <div className="method-dropdown-container" data-testid="grpc-methods-dropdown">
        <Dropdown onCreate={onMethodDropdownCreate} icon={<MethodsDropdownIcon />} placement="bottom-end" style={{ maxWidth: 'unset' }} onShow={handleDropdownShow}>
          <SearchInput
            searchText={searchText}
            setSearchText={setSearchText}
            placeholder="Search"
            ref={searchInputRef}
            onKeyDown={handleKeyDown}
            onBlur={focusSearchInput}
            onChange={handleSearchChange}
            className="mt-2 mb-3"
            data-testid="grpc-methods-search-input"
          />
          <div ref={listRef} className="method-dropdown-list" data-testid="grpc-methods-list">
            {Object.entries(groupedMethods).map(([serviceName, methods], serviceIndex) => (
              <div key={serviceIndex} className="method-dropdown-service-group" onKeyDown={handleKeyDown} tabIndex={0}>
                <div className="method-dropdown-service-header">
                  {serviceName || 'Default Service'}
                </div>
                <div>
                  {methods.map((method: GrpcMethod, methodIndex: number) => {
                    const globalMethodIndex
                      = Object.values(groupedMethods)
                        .slice(0, serviceIndex)
                        .reduce((acc: number, group: GrpcMethod[]) => acc + group.length, 0) + methodIndex;
                    const isSelected = selectedGrpcMethod && selectedGrpcMethod.path === method.path;
                    const isFocused = focusedIndex === globalMethodIndex;
                    return (
                      <div
                        key={`${serviceIndex}-${methodIndex}`}
                        className={`method-dropdown-method-item ${
                          isSelected ? 'method-dropdown-method-item--selected' : ''
                        } ${isFocused ? 'method-dropdown-method-item--focused' : ''}`}
                        onClick={() => handleGrpcMethodSelect(method)}
                        data-index={globalMethodIndex}
                        data-testid="grpc-method-item"
                      >
                        <div className="method-dropdown-method-content">
                          <div className="method-dropdown-method-icon">
                            {getIconForMethodType(method.type)}
                          </div>
                          <div className="method-dropdown-method-details">
                            <div className="method-dropdown-method-name">
                              {method.methodName}
                            </div>
                            <div className="method-dropdown-method-type">
                              {method.type}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {filteredMethods.length === 0 && (
              <div className="method-dropdown-empty-state">
                <div className="method-dropdown-empty-state-text">
                  No methods found for the search term
                </div>
              </div>
            )}
          </div>
        </Dropdown>
      </div>
    </StyledWrapper>
  );
};

export default MethodDropdown;
